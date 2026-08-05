import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { types as ms } from 'mediasoup';
import { config } from '../config.js';
import { childLogger, type Logger } from '../logger.js';
import type { Peer } from '../room/Peer.js';

interface Track {
  producerId: string;
  kind: 'audio' | 'video';
  consumer: ms.Consumer;
  transport: ms.PlainTransport;
  rtpPort: number;
  rtcpPort: number;
  payloadType: number;
  codecName: string;
  clockRate: number;
  channels?: number;
}

interface PeerRecording {
  peerId: string;
  displayName: string;
  file: string;
  startedAt: number;
  tracks: Track[];
  process?: ChildProcess;
  sdpPath: string;
}

/** Ports handed to ffmpeg. Kept out of the mediasoup RTC range to avoid clashes. */
let nextPort = 51000;
function allocatePortPair(): { rtp: number; rtcp: number } {
  const rtp = nextPort;
  nextPort += 2;
  if (nextPort > 55000) nextPort = 51000;
  return { rtp, rtcp: rtp + 1 };
}

/**
 * Server-side recording.
 *
 * Each participant's tracks are forwarded out of the router over PlainTransport
 * to a dedicated ffmpeg process, which muxes them into one WebM per participant.
 * A manifest plus a generated `compose.sh` let a post-processing step build the
 * grid/speaker composite offline — mixing live would burn a CPU core per room and
 * is exactly what production recorders push to a batch stage.
 */
export class MeetingRecorder {
  private readonly log: Logger;
  private readonly recordings = new Map<string, PeerRecording>();
  private recordingId = '';
  private dir = '';
  private startedAt = 0;
  private _active = false;

  constructor(
    private readonly roomId: string,
    private readonly router: ms.Router,
  ) {
    this.log = childLogger('recorder', { roomId });
  }

  get active(): boolean {
    return this._active;
  }

  async start(): Promise<string> {
    this.recordingId = `${this.roomId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${nanoid(6)}`;
    this.dir = path.resolve(config.recording.outputDir, this.recordingId);
    await fs.mkdir(this.dir, { recursive: true });
    this.startedAt = Date.now();
    this._active = true;
    this.log.info({ recordingId: this.recordingId, dir: this.dir }, 'recording started');
    return this.recordingId;
  }

  async addProducer(peer: Peer, producer: ms.Producer): Promise<void> {
    if (!this._active) return;
    const source = (producer.appData as { source?: string }).source;
    // Screen audio is captured; the screen video track is recorded as its own
    // "peer" entry so the composer can lay it out as the main stage.
    const key = source === 'screen' || source === 'screen-audio' ? `${peer.id}:screen` : peer.id;

    let recording = this.recordings.get(key);
    if (!recording) {
      const label = source === 'screen' || source === 'screen-audio' ? `${peer.displayName} (screen)` : peer.displayName;
      recording = {
        peerId: peer.id,
        displayName: label,
        file: path.join(this.dir, `${sanitize(label)}-${peer.id.slice(0, 6)}.webm`),
        sdpPath: path.join(this.dir, `${sanitize(label)}-${peer.id.slice(0, 6)}.sdp`),
        startedAt: Date.now(),
        tracks: [],
      };
      this.recordings.set(key, recording);
    }

    if (recording.tracks.some((t) => t.kind === producer.kind)) return;

    const track = await this.createTrack(producer);
    if (!track) return;
    recording.tracks.push(track);

    // Restart ffmpeg once both tracks are known, or after a short grace period
    // if the peer only ever publishes one kind.
    if (recording.process) {
      recording.process.kill('SIGINT');
      recording.process = undefined;
    }
    setTimeout(() => {
      if (this._active && recording && !recording.process) void this.launchFfmpeg(recording);
    }, 500);
  }

  private async createTrack(producer: ms.Producer): Promise<Track | null> {
    try {
      const transport = await this.router.createPlainTransport({
        ...config.mediasoup.plainTransportOptions,
        rtcpMux: false,
        comedia: false,
      });

      const { rtp, rtcp } = allocatePortPair();
      await transport.connect({ ip: '127.0.0.1', port: rtp, rtcpPort: rtcp });

      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: this.router.rtpCapabilities,
        paused: true,
      });

      const codec = consumer.rtpParameters.codecs[0];
      const track: Track = {
        producerId: producer.id,
        kind: producer.kind as 'audio' | 'video',
        consumer,
        transport,
        rtpPort: rtp,
        rtcpPort: rtcp,
        payloadType: codec.payloadType,
        codecName: codec.mimeType.split('/')[1].toUpperCase(),
        clockRate: codec.clockRate,
        channels: codec.channels,
      };

      // Resume once ffmpeg has had a moment to bind its sockets.
      setTimeout(() => void consumer.resume().catch(() => undefined), 1200);
      return track;
    } catch (error) {
      this.log.error({ err: error, producerId: producer.id }, 'failed to create recording track');
      return null;
    }
  }

  private buildSdp(recording: PeerRecording): string {
    const lines = [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      `s=meet-${recording.peerId}`,
      'c=IN IP4 127.0.0.1',
      't=0 0',
    ];

    for (const track of recording.tracks) {
      if (track.kind === 'audio') {
        lines.push(
          `m=audio ${track.rtpPort} RTP/AVP ${track.payloadType}`,
          `a=rtpmap:${track.payloadType} ${track.codecName}/${track.clockRate}/${track.channels ?? 2}`,
          `a=rtcp:${track.rtcpPort}`,
          'a=fmtp:111 minptime=10;useinbandfec=1',
          'a=recvonly',
        );
      } else {
        lines.push(
          `m=video ${track.rtpPort} RTP/AVP ${track.payloadType}`,
          `a=rtpmap:${track.payloadType} ${track.codecName}/${track.clockRate}`,
          `a=rtcp:${track.rtcpPort}`,
          'a=recvonly',
        );
      }
    }
    return lines.join('\n') + '\n';
  }

  private async launchFfmpeg(recording: PeerRecording): Promise<void> {
    const sdp = this.buildSdp(recording);
    await fs.writeFile(recording.sdpPath, sdp, 'utf8');

    const hasVideo = recording.tracks.some((t) => t.kind === 'video');
    const hasAudio = recording.tracks.some((t) => t.kind === 'audio');
    if (!hasVideo && !hasAudio) return;

    const args = [
      '-nostdin',
      '-loglevel', 'warning',
      '-protocol_whitelist', 'file,crypto,data,rtp,udp',
      // Late-arriving RTP is normal; a generous reorder queue avoids dropped frames.
      '-reorder_queue_size', '256',
      '-max_delay', '500000',
      '-fflags', '+genpts',
      '-f', 'sdp',
      '-i', recording.sdpPath,
    ];

    if (hasVideo) args.push('-map', '0:v:0', '-c:v', 'copy');
    if (hasAudio) args.push('-map', '0:a:0', '-c:a', 'copy');

    args.push('-f', 'webm', '-y', recording.file);

    this.log.info({ file: recording.file, hasVideo, hasAudio }, 'starting ffmpeg');
    const proc = spawn(config.recording.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    recording.process = proc;

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) this.log.debug({ ffmpeg: text }, 'ffmpeg');
    });

    proc.on('error', (error) => {
      this.log.error({ err: error }, 'ffmpeg failed to spawn — is ffmpeg installed?');
    });

    proc.on('exit', (code, signal) => {
      this.log.info({ code, signal, file: recording.file }, 'ffmpeg exited');
    });
  }

  async stop(): Promise<void> {
    if (!this._active) return;
    this._active = false;
    this.log.info({ recordingId: this.recordingId }, 'stopping recording');

    for (const recording of this.recordings.values()) {
      for (const track of recording.tracks) {
        try {
          track.consumer.close();
          track.transport.close();
        } catch {
          /* already closed */
        }
      }
      // SIGINT lets ffmpeg finalise the container; SIGKILL would corrupt it.
      recording.process?.kill('SIGINT');
    }

    await this.writeManifest();
    this.recordings.clear();
  }

  private async writeManifest(): Promise<void> {
    if (!this.dir) return;
    const manifest = {
      recordingId: this.recordingId,
      roomId: this.roomId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      durationMs: Date.now() - this.startedAt,
      participants: [...this.recordings.values()].map((r) => ({
        peerId: r.peerId,
        displayName: r.displayName,
        file: path.basename(r.file),
        offsetMs: r.startedAt - this.startedAt,
        tracks: r.tracks.map((t) => ({ kind: t.kind, codec: t.codecName })),
      })),
    };

    try {
      await fs.writeFile(path.join(this.dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      await fs.writeFile(path.join(this.dir, 'compose.sh'), this.buildComposeScript(manifest), { mode: 0o755 });
    } catch (error) {
      this.log.warn({ err: error }, 'failed to write manifest');
    }
  }

  /** Generates an offline ffmpeg command that grids the per-participant files. */
  private buildComposeScript(manifest: { participants: Array<{ file: string; offsetMs: number }> }): string {
    const files = manifest.participants;
    if (files.length === 0) return '#!/bin/sh\necho "nothing recorded"\n';

    const cols = Math.ceil(Math.sqrt(files.length));
    const rows = Math.ceil(files.length / cols);
    const cellW = 640;
    const cellH = 360;

    const inputs = files.map((f) => `-itsoffset ${(f.offsetMs / 1000).toFixed(3)} -i "${f.file}"`).join(' \\\n  ');

    const scales = files
      .map((_, i) => `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
      .join(';');

    const layout = files
      .map((_, i) => `${(i % cols) * cellW}_${Math.floor(i / cols) * cellH}`)
      .join('|');

    const xstackInputs = files.map((_, i) => `[v${i}]`).join('');
    const xstack =
      files.length > 1
        ? `${xstackInputs}xstack=inputs=${files.length}:layout=${layout}:fill=black[grid]`
        : `[v0]copy[grid]`;

    const amix =
      files.length > 1
        ? `${files.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${files.length}:duration=longest:dropout_transition=0[aout]`
        : `[0:a]anull[aout]`;

    return `#!/bin/sh
# Composes the per-participant recordings into a single ${cols}x${rows} grid video.
# Requires ffmpeg. Run from inside this directory.
set -e
ffmpeg \\
  ${inputs} \\
  -filter_complex "${scales};${xstack};${amix}" \\
  -map "[grid]" -map "[aout]" \\
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \\
  -c:a aac -b:a 160k \\
  -movflags +faststart \\
  -y composite.mp4
echo "wrote composite.mp4"
`;
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48) || 'peer';
}
