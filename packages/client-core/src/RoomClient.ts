import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer, RtpCapabilities } from 'mediasoup-client/types';
import {
  AUDIO_CONSTRAINTS,
  ErrorCodes,
  OPUS_PRODUCER_OPTIONS,
  OPUS_SCREEN_AUDIO_OPTIONS,
  ProtocolError,
  SCREEN_CONSTRAINTS,
  SCREEN_SIMULCAST_ENCODINGS,
  SCREEN_SVC_ENCODINGS,
  VIDEO_CONSTRAINTS,
  WEBCAM_SIMULCAST_ENCODINGS,
  WEBCAM_SVC_ENCODINGS,
  qualityFromScore,
  spatialLayerForWidth,
  type ChatMessage,
  type LobbyPeer,
  type NetworkQuality,
  type PeerInfo,
  type PeerRole,
  type ProducerSource,
  type Reaction,
  type RoomInfo,
  type ServerNotifications,
  type VideoQuality,
} from '@meet/protocol';
import { Emitter } from './emitter.js';
import { SignalingClient, type ConnectionState, type SignalingOptions } from './SignalingClient.js';
import { stopStream, type DeviceOption, type MediaAdapter } from './media.js';

export interface ConsumerEntry {
  id: string;
  peerId: string;
  source: ProducerSource;
  consumer: Consumer;
  stream: MediaStream;
  /** Paused locally by us (off-screen tile) or remotely by the producer. */
  locallyPaused: boolean;
  remotelyPaused: boolean;
  score: number;
  spatialLayer: number | null;
}

export interface LocalMediaState {
  micEnabled: boolean;
  micMuted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  screenAudioEnabled: boolean;
  facingMode: 'user' | 'environment';
  videoQuality: VideoQuality;
  selectedMicId?: string;
  selectedCameraId?: string;
  selectedSpeakerId?: string;
}

export interface RoomState {
  connection: ConnectionState;
  /** True once the join handshake completed and media can flow. */
  joined: boolean;
  inLobby: boolean;
  self?: PeerInfo;
  room?: RoomInfo;
  peers: Map<string, PeerInfo>;
  consumers: Map<string, ConsumerEntry>;
  lobbyPeers: LobbyPeer[];
  chat: ChatMessage[];
  activeSpeakerId: string | null;
  audioLevels: Map<string, number>;
  quality: NetworkQuality;
  local: LocalMediaState;
  error?: { code: string; message: string };
}

interface RoomEvents {
  stateChanged: RoomState;
  chatMessage: ChatMessage;
  reaction: Reaction;
  /** A moderator muted us / stopped our video or share. */
  moderatorAction: ServerNotifications['moderatorAction'];
  removed: { reason: string };
  meetingEnded: { reason: string };
  lobbyDenied: { reason: string };
  error: { code: string; message: string };
  /** Emitted when a local media stream is created or replaced. */
  localStream: { source: ProducerSource; stream: MediaStream | null };
  screenShareStopped: void;
}

export interface RoomClientOptions extends Omit<SignalingOptions, 'WebSocketImpl'> {
  media: MediaAdapter;
  WebSocketImpl?: typeof WebSocket;
  /** Start with mic/camera on. */
  initialMicEnabled?: boolean;
  initialCameraEnabled?: boolean;
  videoQuality?: VideoQuality;
  deviceName?: string;
}

const STATS_INTERVAL_MS = 3000;

/**
 * The full client-side meeting engine: signaling, mediasoup transports,
 * publishing, subscribing, moderation and reconnection.
 *
 * Platform code supplies a `MediaAdapter` and renders `state`; everything else —
 * including simulcast layer selection, screen-share lifecycle and recovery from a
 * dropped connection — lives here so web and Android behave identically.
 */
export class RoomClient extends Emitter<RoomEvents> {
  private readonly signaling: SignalingClient;
  private readonly media: MediaAdapter;
  private readonly options: RoomClientOptions;
  private device?: Device;

  private sendTransport?: Transport;
  private recvTransport?: Transport;

  private micProducer?: Producer;
  private webcamProducer?: Producer;
  private screenProducer?: Producer;
  private screenAudioProducer?: Producer;

  private micStream?: MediaStream;
  private webcamStream?: MediaStream;
  private screenStream?: MediaStream;

  private statsTimer?: ReturnType<typeof setInterval>;
  private closed = false;
  private joining = false;
  /** Tile widths reported by the UI, used to pick simulcast layers. */
  private readonly renderSizes = new Map<string, number>();

  state: RoomState;

  constructor(options: RoomClientOptions) {
    super();
    this.options = options;
    this.media = options.media;

    this.state = {
      connection: 'new',
      joined: false,
      inLobby: false,
      peers: new Map(),
      consumers: new Map(),
      lobbyPeers: [],
      chat: [],
      activeSpeakerId: null,
      audioLevels: new Map(),
      quality: 'excellent',
      local: {
        micEnabled: false,
        micMuted: false,
        cameraEnabled: false,
        screenSharing: false,
        screenAudioEnabled: false,
        facingMode: 'user',
        videoQuality: options.videoQuality ?? 'high',
      },
    };

    this.signaling = new SignalingClient({
      url: options.url,
      roomId: options.roomId,
      peerId: options.peerId,
      displayName: options.displayName,
      token: options.token,
      WebSocketImpl: options.WebSocketImpl,
    });

    this.signaling.on('stateChanged', (connection) => {
      this.patch({ connection });
    });
    this.signaling.on('notification', ({ method, data }) => this.onNotification(method, data));
    this.signaling.on('reconnected', () => void this.rejoinAfterReconnect());
    this.signaling.onServerRequest(async (method, data) => {
      if (method === 'newConsumer') {
        await this.onNewConsumer(data);
        return {};
      }
      throw new ProtocolError(ErrorCodes.BAD_REQUEST, `unknown server request ${String(method)}`);
    });
  }

  /* ------------------------------------------------------------- lifecycle */

  async join(): Promise<void> {
    if (this.joining) return;
    this.joining = true;
    try {
      await this.signaling.connect();
      await this.setupDevice();
      await this.doJoin();
    } finally {
      this.joining = false;
    }
  }

  private async setupDevice(): Promise<void> {
    const { rtpCapabilities } = await this.signaling.request('getRouterRtpCapabilities');
    const device = new Device(this.media.handlerName ? { handlerName: this.media.handlerName as never } : undefined);
    await device.load({ routerRtpCapabilities: rtpCapabilities as RtpCapabilities });
    this.device = device;
  }

  private async doJoin(): Promise<void> {
    if (!this.device) throw new Error('device not loaded');

    const response = await this.signaling.request('join', {
      displayName: this.options.displayName,
      device: {
        name: this.options.deviceName ?? this.media.platform,
        platform: this.media.platform,
      },
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (response.status === 'lobby') {
      this.patch({ inLobby: true, joined: false });
      return;
    }

    const peers = new Map<string, PeerInfo>();
    for (const peer of response.peers) peers.set(peer.id, peer);

    this.patch({
      joined: true,
      inLobby: false,
      self: response.self,
      room: response.room,
      peers,
      chat: response.chatHistory,
    });

    // Transports must exist before the server starts pushing consumers.
    await this.createTransports();
    this.startStatsLoop();

    if (this.options.initialMicEnabled ?? true) await this.enableMic().catch((e) => this.reportError(e));
    if (this.options.initialCameraEnabled ?? false) await this.enableCamera().catch((e) => this.reportError(e));
  }

  private async createTransports(): Promise<void> {
    if (!this.device) throw new Error('device not loaded');

    if (this.device.canProduce('audio') || this.device.canProduce('video')) {
      const params = await this.signaling.request('createWebRtcTransport', { producing: true, consuming: false });
      const transport = this.device.createSendTransport({
        id: params.id,
        iceParameters: params.iceParameters,
        iceCandidates: params.iceCandidates,
        dtlsParameters: params.dtlsParameters,
        sctpParameters: params.sctpParameters,
        iceServers: params.iceServers,
        // Deferring TURN discovery to the pool below keeps join latency low.
        iceTransportPolicy: undefined,
      });
      this.wireTransport(transport, true);
      this.sendTransport = transport;
    }

    const recvParams = await this.signaling.request('createWebRtcTransport', { producing: false, consuming: true });
    const recvTransport = this.device.createRecvTransport({
      id: recvParams.id,
      iceParameters: recvParams.iceParameters,
      iceCandidates: recvParams.iceCandidates,
      dtlsParameters: recvParams.dtlsParameters,
      sctpParameters: recvParams.sctpParameters,
      iceServers: recvParams.iceServers,
    });
    this.wireTransport(recvTransport, false);
    this.recvTransport = recvTransport;
  }

  private wireTransport(transport: Transport, producing: boolean): void {
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.signaling
        .request('connectWebRtcTransport', { transportId: transport.id, dtlsParameters })
        .then(() => callback())
        .catch((error) => errback(error as Error));
    });

    if (producing) {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        this.signaling
          .request('produce', {
            transportId: transport.id,
            kind,
            rtpParameters,
            appData: appData as { source: ProducerSource },
          })
          .then(({ id }) => callback({ id }))
          .catch((error) => errback(error as Error));
      });
    }

    transport.on('connectionstatechange', (state) => {
      if (state === 'failed') {
        // An ICE restart recovers from a network change (Wi-Fi → cellular)
        // without tearing down the whole session.
        void this.restartIce(transport);
      }
      if (state === 'disconnected') {
        this.patch({ quality: 'poor' });
      }
    });
  }

  private async restartIce(transport: Transport): Promise<void> {
    try {
      const { iceParameters } = await this.signaling.request('restartIce', { transportId: transport.id });
      await transport.restartIce({ iceParameters: iceParameters as never });
    } catch (error) {
      this.reportError(error);
    }
  }

  /** Rebuilds the whole media session after the socket came back. */
  private async rejoinAfterReconnect(): Promise<void> {
    if (this.closed) return;
    try {
      const wasMic = this.state.local.micEnabled;
      const wasCam = this.state.local.cameraEnabled;
      const wasScreen = this.state.local.screenSharing;

      this.teardownMedia({ keepLocalStreams: true });
      await this.setupDevice();
      await this.doJoin();

      if (wasMic && !this.micProducer) await this.enableMic();
      if (wasCam && !this.webcamProducer) await this.enableCamera();
      if (wasScreen && !this.screenProducer && this.screenStream) await this.republishScreen();
    } catch (error) {
      this.reportError(error);
    }
  }

  /* ------------------------------------------------------------ microphone */

  async enableMic(): Promise<void> {
    if (this.micProducer && !this.micProducer.closed) {
      await this.unmuteMic();
      return;
    }
    if (!this.sendTransport) throw new Error('not connected');

    const stream = await this.media.getUserMedia({
      audio: {
        ...AUDIO_CONSTRAINTS,
        ...(this.state.local.selectedMicId ? { deviceId: { exact: this.state.local.selectedMicId } } : {}),
      },
    });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('no microphone track');

    this.micStream = stream;
    this.emit('localStream', { source: 'mic', stream });

    this.micProducer = await this.sendTransport.produce({
      track,
      codecOptions: OPUS_PRODUCER_OPTIONS,
      appData: { source: 'mic' },
    });

    this.micProducer.on('transportclose', () => {
      this.micProducer = undefined;
    });
    this.micProducer.on('trackended', () => {
      // The OS took the device away (unplugged headset, another app grabbed it).
      void this.disableMic();
      this.reportError(new Error('Your microphone was disconnected.'));
    });

    this.patchLocal({ micEnabled: true, micMuted: false });
  }

  async muteMic(): Promise<void> {
    if (!this.micProducer) return;
    this.micProducer.pause();
    await this.signaling.request('pauseProducer', { producerId: this.micProducer.id }).catch(() => undefined);
    this.patchLocal({ micMuted: true });
  }

  async unmuteMic(): Promise<void> {
    if (!this.micProducer) {
      await this.enableMic();
      return;
    }
    this.micProducer.resume();
    await this.signaling.request('resumeProducer', { producerId: this.micProducer.id });
    this.patchLocal({ micMuted: false });
  }

  async toggleMic(): Promise<void> {
    if (!this.state.local.micEnabled) return this.enableMic();
    return this.state.local.micMuted ? this.unmuteMic() : this.muteMic();
  }

  async disableMic(): Promise<void> {
    if (this.micProducer) {
      const id = this.micProducer.id;
      this.micProducer.close();
      this.micProducer = undefined;
      await this.signaling.request('closeProducer', { producerId: id }).catch(() => undefined);
    }
    stopStream(this.micStream);
    this.micStream = undefined;
    this.emit('localStream', { source: 'mic', stream: null });
    this.patchLocal({ micEnabled: false, micMuted: false });
  }

  /* --------------------------------------------------------------- camera */

  async enableCamera(): Promise<void> {
    if (this.webcamProducer && !this.webcamProducer.closed) return;
    if (!this.sendTransport) throw new Error('not connected');

    const quality = VIDEO_CONSTRAINTS[this.state.local.videoQuality];
    const stream = await this.media.getUserMedia({
      video: {
        ...quality,
        ...(this.state.local.selectedCameraId
          ? { deviceId: { exact: this.state.local.selectedCameraId } }
          : { facingMode: this.state.local.facingMode }),
      },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no camera track');

    this.webcamStream = stream;
    this.emit('localStream', { source: 'webcam', stream });

    const useSvc = this.prefersVp9();
    this.webcamProducer = await this.sendTransport.produce({
      track,
      encodings: useSvc ? WEBCAM_SVC_ENCODINGS : WEBCAM_SIMULCAST_ENCODINGS,
      codecOptions: { videoGoogleStartBitrate: 1000 },
      appData: { source: 'webcam' },
    });

    this.webcamProducer.on('transportclose', () => {
      this.webcamProducer = undefined;
    });
    this.webcamProducer.on('trackended', () => {
      void this.disableCamera();
      this.reportError(new Error('Your camera was disconnected.'));
    });

    this.patchLocal({ cameraEnabled: true });
  }

  async disableCamera(): Promise<void> {
    if (this.webcamProducer) {
      const id = this.webcamProducer.id;
      this.webcamProducer.close();
      this.webcamProducer = undefined;
      await this.signaling.request('closeProducer', { producerId: id }).catch(() => undefined);
    }
    stopStream(this.webcamStream);
    this.webcamStream = undefined;
    this.emit('localStream', { source: 'webcam', stream: null });
    this.patchLocal({ cameraEnabled: false });
  }

  async toggleCamera(): Promise<void> {
    return this.state.local.cameraEnabled ? this.disableCamera() : this.enableCamera();
  }

  /** Front/back on mobile. Replaces the track in place so the SFU never re-negotiates. */
  async switchCamera(): Promise<void> {
    if (!this.webcamProducer) return;
    const facingMode = this.state.local.facingMode === 'user' ? 'environment' : 'user';

    const quality = VIDEO_CONSTRAINTS[this.state.local.videoQuality];
    const stream = await this.media.getUserMedia({ video: { ...quality, facingMode } });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no camera track');

    stopStream(this.webcamStream);
    this.webcamStream = stream;
    await this.webcamProducer.replaceTrack({ track });
    this.emit('localStream', { source: 'webcam', stream });
    this.patchLocal({ facingMode, selectedCameraId: undefined });
  }

  /** Switches to a specific input device without dropping the producer. */
  async setDevice(kind: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string): Promise<void> {
    if (kind === 'audiooutput') {
      this.patchLocal({ selectedSpeakerId: deviceId });
      await this.media.setAudioOutput?.(deviceId);
      return;
    }

    if (kind === 'audioinput') {
      this.patchLocal({ selectedMicId: deviceId });
      if (!this.micProducer) return;
      const stream = await this.media.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
      });
      const track = stream.getAudioTracks()[0];
      stopStream(this.micStream);
      this.micStream = stream;
      await this.micProducer.replaceTrack({ track });
      this.emit('localStream', { source: 'mic', stream });
      return;
    }

    this.patchLocal({ selectedCameraId: deviceId });
    if (!this.webcamProducer) return;
    const quality = VIDEO_CONSTRAINTS[this.state.local.videoQuality];
    const stream = await this.media.getUserMedia({ video: { ...quality, deviceId: { exact: deviceId } } });
    const track = stream.getVideoTracks()[0];
    stopStream(this.webcamStream);
    this.webcamStream = stream;
    await this.webcamProducer.replaceTrack({ track });
    this.emit('localStream', { source: 'webcam', stream });
  }

  async setVideoQuality(videoQuality: VideoQuality): Promise<void> {
    this.patchLocal({ videoQuality });
    if (!this.webcamProducer) return;
    const constraints = VIDEO_CONSTRAINTS[videoQuality];
    const track = this.webcamProducer.track;
    // applyConstraints re-negotiates resolution without a new track or producer.
    await track?.applyConstraints(constraints as MediaTrackConstraints).catch(() => undefined);
  }

  listDevices(): Promise<DeviceOption[]> {
    return this.media.enumerateDevices();
  }

  /* --------------------------------------------------------- screen share */

  async startScreenShare(withAudio = true): Promise<void> {
    if (this.state.local.screenSharing) return;
    if (!this.sendTransport) throw new Error('not connected');
    if (!this.media.supportsDisplayMedia()) {
      throw new ProtocolError(ErrorCodes.UNSUPPORTED, 'Screen sharing is not supported on this device.');
    }

    // Android needs its MediaProjection foreground service up before capture.
    await this.media.prepareScreenCapture?.();

    let stream: MediaStream;
    try {
      stream = await this.media.getDisplayMedia({
        video: SCREEN_CONSTRAINTS.video as MediaTrackConstraints,
        audio: withAudio ? (SCREEN_CONSTRAINTS.audio as MediaTrackConstraints) : false,
      });
    } catch (error) {
      await this.media.releaseScreenCapture?.();
      // The user pressing "Cancel" in the picker is not an error worth shouting about.
      if (error instanceof Error && /permission|denied|abort|cancel/i.test(error.message)) {
        throw new ProtocolError(ErrorCodes.FORBIDDEN, 'Screen share cancelled.');
      }
      throw error;
    }

    this.screenStream = stream;
    this.emit('localStream', { source: 'screen', stream });

    try {
      await this.publishScreenTracks(stream, withAudio);
    } catch (error) {
      await this.stopScreenShare();
      throw error;
    }

    // Clicking the browser's "Stop sharing" bar ends the track directly.
    const videoTrack = stream.getVideoTracks()[0];
    videoTrack?.addEventListener('ended', () => {
      void this.stopScreenShare();
      this.emit('screenShareStopped', undefined);
    });

    this.patchLocal({ screenSharing: true, screenAudioEnabled: Boolean(this.screenAudioProducer) });
  }

  private async publishScreenTracks(stream: MediaStream, withAudio: boolean): Promise<void> {
    if (!this.sendTransport) throw new Error('not connected');

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('no screen video track');

    const useSvc = this.prefersVp9();
    this.screenProducer = await this.sendTransport.produce({
      track: videoTrack,
      encodings: useSvc ? SCREEN_SVC_ENCODINGS : SCREEN_SIMULCAST_ENCODINGS,
      codecOptions: { videoGoogleStartBitrate: 1500 },
      appData: { source: 'screen' },
    });

    this.screenProducer.on('transportclose', () => {
      this.screenProducer = undefined;
    });
    this.screenProducer.on('trackended', () => {
      void this.stopScreenShare();
    });

    // Tab/system audio is optional and frequently absent — never fail the share on it.
    const audioTrack = withAudio ? stream.getAudioTracks()[0] : undefined;
    if (audioTrack) {
      try {
        this.screenAudioProducer = await this.sendTransport.produce({
          track: audioTrack,
          codecOptions: OPUS_SCREEN_AUDIO_OPTIONS,
          appData: { source: 'screen-audio' },
        });
        this.screenAudioProducer.on('transportclose', () => {
          this.screenAudioProducer = undefined;
        });
      } catch (error) {
        console.warn('[room] screen audio could not be published', error);
      }
    }
  }

  private async republishScreen(): Promise<void> {
    if (!this.screenStream) return;
    await this.publishScreenTracks(this.screenStream, true);
    this.patchLocal({ screenSharing: true });
  }

  async stopScreenShare(): Promise<void> {
    const producers = [this.screenProducer, this.screenAudioProducer].filter(Boolean) as Producer[];
    this.screenProducer = undefined;
    this.screenAudioProducer = undefined;

    for (const producer of producers) {
      const id = producer.id;
      producer.close();
      await this.signaling.request('closeProducer', { producerId: id }).catch(() => undefined);
    }

    stopStream(this.screenStream);
    this.screenStream = undefined;
    await this.media.releaseScreenCapture?.();

    this.emit('localStream', { source: 'screen', stream: null });
    this.patchLocal({ screenSharing: false, screenAudioEnabled: false });
  }

  async toggleScreenShare(): Promise<void> {
    return this.state.local.screenSharing ? this.stopScreenShare() : this.startScreenShare();
  }

  /* ------------------------------------------------------------ consuming */

  private async onNewConsumer(payload: unknown): Promise<void> {
    const data = payload as {
      peerId: string;
      producerId: string;
      id: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
      appData: { source: ProducerSource };
      producerPaused: boolean;
    };

    // The server defers `newConsumer` until after the transport response, but a
    // slow render or a re-join can still put this a beat ahead. Wait briefly
    // rather than dropping the stream on the floor.
    const recvTransport = await this.waitForRecvTransport();

    const consumer = await recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters as never,
      appData: { peerId: data.peerId, source: data.appData.source },
    });

    const stream = new MediaStream([consumer.track]);

    const entry: ConsumerEntry = {
      id: consumer.id,
      peerId: data.peerId,
      source: data.appData.source,
      consumer,
      stream,
      locallyPaused: false,
      remotelyPaused: data.producerPaused,
      score: 10,
      spatialLayer: null,
    };

    consumer.on('transportclose', () => this.removeConsumer(consumer.id));

    const consumers = new Map(this.state.consumers);
    consumers.set(consumer.id, entry);
    this.patch({ consumers });

    // Apply the layer that matches however large this tile is currently rendered.
    const width = this.renderSizes.get(`${data.peerId}:${data.appData.source}`);
    if (width && data.kind === 'video') void this.applyPreferredLayer(consumer.id, width);
  }

  private async waitForRecvTransport(timeoutMs = 8000): Promise<Transport> {
    const deadline = Date.now() + timeoutMs;
    while (!this.recvTransport && Date.now() < deadline && !this.closed) {
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
    }
    if (!this.recvTransport) throw new Error('no receive transport');
    return this.recvTransport;
  }

  private removeConsumer(consumerId: string): void {
    const entry = this.state.consumers.get(consumerId);
    if (!entry) return;
    try {
      entry.consumer.close();
    } catch {
      /* already closed */
    }
    const consumers = new Map(this.state.consumers);
    consumers.delete(consumerId);
    this.patch({ consumers });
  }

  private updateConsumer(consumerId: string, patch: Partial<ConsumerEntry>): void {
    const entry = this.state.consumers.get(consumerId);
    if (!entry) return;
    const consumers = new Map(this.state.consumers);
    consumers.set(consumerId, { ...entry, ...patch });
    this.patch({ consumers });
  }

  /**
   * Tells the SFU how big we are actually rendering a remote video.
   *
   * This is the single biggest bandwidth lever in a grid layout: 24 thumbnails at
   * the lowest spatial layer cost roughly what two full-resolution tiles do.
   */
  setRenderSize(peerId: string, source: ProducerSource, width: number): void {
    const key = `${peerId}:${source}`;
    const previous = this.renderSizes.get(key);
    // Ignore sub-pixel resize noise from layout thrash.
    if (previous && Math.abs(previous - width) < 40) return;
    this.renderSizes.set(key, width);

    const entry = [...this.state.consumers.values()].find((c) => c.peerId === peerId && c.source === source);
    if (entry && entry.consumer.kind === 'video') void this.applyPreferredLayer(entry.id, width);
  }

  private async applyPreferredLayer(consumerId: string, width: number): Promise<void> {
    const entry = this.state.consumers.get(consumerId);
    if (!entry) return;
    const layers = entry.source === 'screen' ? 2 : 3;
    const spatialLayer = spatialLayerForWidth(width, layers);
    try {
      await this.signaling.request('setConsumerPreferredLayers', {
        consumerId,
        spatialLayer,
        temporalLayer: 2,
      });
    } catch {
      /* consumer may have gone away mid-resize */
    }
  }

  /** Pauses a consumer whose tile is off-screen; saves downstream bandwidth. */
  async setConsumerVisible(peerId: string, source: ProducerSource, visible: boolean): Promise<void> {
    const entry = [...this.state.consumers.values()].find((c) => c.peerId === peerId && c.source === source);
    if (!entry || entry.consumer.kind !== 'video') return;
    if (entry.locallyPaused === !visible) return;

    try {
      if (visible) {
        entry.consumer.resume();
        await this.signaling.request('resumeConsumer', { consumerId: entry.id });
      } else {
        entry.consumer.pause();
        await this.signaling.request('pauseConsumer', { consumerId: entry.id });
      }
      this.updateConsumer(entry.id, { locallyPaused: !visible });
    } catch (error) {
      this.reportError(error);
    }
  }

  /* ------------------------------------------------------- room commands */

  async sendChatMessage(text: string, to?: string): Promise<void> {
    await this.signaling.request('sendChatMessage', { text, to });
  }

  async raiseHand(raised: boolean): Promise<void> {
    await this.signaling.request('raiseHand', { raised });
  }

  async sendReaction(emoji: string): Promise<void> {
    await this.signaling.request('sendReaction', { emoji });
  }

  async setDisplayName(displayName: string): Promise<void> {
    await this.signaling.request('setDisplayName', { displayName });
  }

  /* --------------------------------------------------------- moderation */

  muteParticipant = (peerId: string) => this.signaling.request('muteParticipant', { peerId });
  muteAll = (allowUnmute: boolean) => this.signaling.request('muteAll', { allowUnmute });
  stopParticipantVideo = (peerId: string) => this.signaling.request('stopParticipantVideo', { peerId });
  stopParticipantShare = (peerId: string) => this.signaling.request('stopParticipantShare', { peerId });
  removeParticipant = (peerId: string) => this.signaling.request('removeParticipant', { peerId });
  setPeerRole = (peerId: string, role: PeerRole) => this.signaling.request('setPeerRole', { peerId, role });
  admitLobbyPeer = (peerId: string, admit: boolean) => this.signaling.request('admitLobbyPeer', { peerId, admit });
  endMeeting = () => this.signaling.request('endMeeting', {});
  startRecording = () => this.signaling.request('startRecording', {});
  stopRecording = () => this.signaling.request('stopRecording', {});

  async setRoomSettings(
    patch: Partial<Pick<RoomInfo, 'locked' | 'lobbyEnabled' | 'allowUnmute' | 'allowScreenShare' | 'allowChat'>>,
  ): Promise<void> {
    await this.signaling.request('setRoomSettings', patch);
  }

  /* ----------------------------------------------------------- reactions */

  private onNotification(method: string, payload: unknown): void {
    switch (method) {
      case 'newPeer': {
        const peer = payload as PeerInfo;
        const peers = new Map(this.state.peers);
        peers.set(peer.id, peer);
        this.patch({ peers });
        break;
      }

      case 'peerClosed': {
        const { peerId } = payload as { peerId: string };
        const peers = new Map(this.state.peers);
        peers.delete(peerId);
        const consumers = new Map(this.state.consumers);
        for (const [id, entry] of consumers) {
          if (entry.peerId === peerId) {
            try {
              entry.consumer.close();
            } catch {
              /* ignore */
            }
            consumers.delete(id);
          }
        }
        this.patch({ peers, consumers });
        break;
      }

      case 'peerUpdated': {
        const update = payload as { peerId: string } & Partial<PeerInfo>;
        const peers = new Map(this.state.peers);
        const existing = peers.get(update.peerId);
        if (existing) {
          peers.set(update.peerId, { ...existing, ...update });
          this.patch({ peers });
        } else if (this.state.self && update.peerId === this.state.self.id) {
          this.patch({ self: { ...this.state.self, ...update } });
        }
        break;
      }

      case 'consumerClosed':
        this.removeConsumer((payload as { consumerId: string }).consumerId);
        break;

      case 'consumerPaused':
        this.updateConsumer((payload as { consumerId: string }).consumerId, { remotelyPaused: true });
        break;

      case 'consumerResumed':
        this.updateConsumer((payload as { consumerId: string }).consumerId, { remotelyPaused: false });
        break;

      case 'consumerLayersChanged': {
        const { consumerId, spatialLayer } = payload as { consumerId: string; spatialLayer: number | null };
        this.updateConsumer(consumerId, { spatialLayer });
        break;
      }

      case 'consumerScore': {
        const { consumerId, score } = payload as { consumerId: string; score: { score: number } };
        this.updateConsumer(consumerId, { score: score.score });
        break;
      }

      case 'activeSpeaker':
        this.patch({ activeSpeakerId: (payload as { peerId: string | null }).peerId });
        break;

      case 'audioLevels': {
        const { levels } = payload as { levels: Array<{ peerId: string; volume: number }> };
        const audioLevels = new Map<string, number>();
        for (const level of levels) audioLevels.set(level.peerId, level.volume);
        this.patch({ audioLevels });
        break;
      }

      case 'chatMessage': {
        const message = payload as ChatMessage;
        this.patch({ chat: [...this.state.chat, message].slice(-500) });
        this.emit('chatMessage', message);
        break;
      }

      case 'reaction':
        this.emit('reaction', payload as Reaction);
        break;

      case 'roomUpdated':
        this.patch({ room: payload as RoomInfo });
        break;

      case 'lobbyUpdated':
        this.patch({ lobbyPeers: (payload as { peers: LobbyPeer[] }).peers });
        break;

      case 'lobbyAdmitted':
        this.patch({ inLobby: false });
        void this.doJoin().catch((error) => this.reportError(error));
        break;

      case 'lobbyDenied':
        this.emit('lobbyDenied', payload as { reason: string });
        break;

      case 'moderatorAction': {
        const action = payload as ServerNotifications['moderatorAction'];
        if (action.action === 'mute') this.patchLocal({ micMuted: true });
        if (action.action === 'stopVideo') void this.disableCamera();
        if (action.action === 'stopShare') void this.stopScreenShare();
        this.emit('moderatorAction', action);
        break;
      }

      case 'recordingStateChanged': {
        const { recording } = payload as { recording: boolean };
        if (this.state.room) this.patch({ room: { ...this.state.room, recording } });
        break;
      }

      case 'removedFromRoom':
        this.emit('removed', payload as { reason: string });
        this.close();
        break;

      case 'meetingEnded':
        this.emit('meetingEnded', payload as { reason: string });
        this.close();
        break;

      case 'serverError': {
        const error = payload as { code: string; message: string };
        this.patch({ error });
        this.emit('error', error);
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- stats */

  private startStatsLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => void this.pollStats(), STATS_INTERVAL_MS);
  }

  private async pollStats(): Promise<void> {
    if (!this.sendTransport || this.closed) return;
    try {
      const stats = await this.sendTransport.getStats();
      let rtt: number | undefined;
      let lossRatio = 0;
      let packetsSent = 0;
      let packetsLost = 0;

      stats.forEach((report: Record<string, number | string>) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = (report.currentRoundTripTime as number) * 1000;
        }
        if (report.type === 'outbound-rtp') packetsSent += (report.packetsSent as number) ?? 0;
        if (report.type === 'remote-inbound-rtp') packetsLost += (report.packetsLost as number) ?? 0;
      });

      if (packetsSent > 0) lossRatio = Math.max(0, packetsLost / packetsSent);

      const quality: NetworkQuality =
        rtt === undefined
          ? this.state.quality
          : rtt < 150 && lossRatio < 0.02
            ? 'excellent'
            : rtt < 300 && lossRatio < 0.05
              ? 'good'
              : rtt < 600 && lossRatio < 0.12
                ? 'poor'
                : 'critical';

      if (quality !== this.state.quality) this.patch({ quality });
    } catch {
      /* stats are best-effort */
    }
  }

  /** Average of the incoming consumer scores for a peer, for the UI signal pip. */
  qualityForPeer(peerId: string): NetworkQuality {
    const entries = [...this.state.consumers.values()].filter((c) => c.peerId === peerId);
    if (entries.length === 0) return 'disconnected';
    const avg = entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
    return qualityFromScore(avg);
  }

  /* --------------------------------------------------------------- utils */

  private prefersVp9(): boolean {
    const codecs = this.device?.rtpCapabilities.codecs ?? [];
    return codecs.some((c) => c.mimeType.toLowerCase() === 'video/vp9');
  }

  getLocalStream(source: ProducerSource): MediaStream | undefined {
    if (source === 'mic') return this.micStream;
    if (source === 'webcam') return this.webcamStream;
    if (source === 'screen' || source === 'screen-audio') return this.screenStream;
    return undefined;
  }

  getStream(peerId: string, source: ProducerSource): MediaStream | undefined {
    return [...this.state.consumers.values()].find((c) => c.peerId === peerId && c.source === source)?.stream;
  }

  /** The peer whose screen is on the main stage, if anyone is sharing. */
  get screenSharingPeerId(): string | null {
    if (this.state.local.screenSharing && this.state.self) return this.state.self.id;
    const entry = [...this.state.consumers.values()].find((c) => c.source === 'screen');
    return entry?.peerId ?? null;
  }

  private patch(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    this.emit('stateChanged', this.state);
  }

  private patchLocal(patch: Partial<LocalMediaState>): void {
    this.patch({ local: { ...this.state.local, ...patch } });
  }

  private reportError(error: unknown): void {
    const payload = {
      code: error instanceof ProtocolError ? error.code : ErrorCodes.INTERNAL,
      message: error instanceof Error ? error.message : String(error),
    };
    console.error('[room]', payload.message, error);
    this.emit('error', payload);
  }

  private teardownMedia(options: { keepLocalStreams?: boolean } = {}): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = undefined;

    for (const entry of this.state.consumers.values()) {
      try {
        entry.consumer.close();
      } catch {
        /* ignore */
      }
    }

    for (const producer of [this.micProducer, this.webcamProducer, this.screenProducer, this.screenAudioProducer]) {
      try {
        producer?.close();
      } catch {
        /* ignore */
      }
    }
    this.micProducer = undefined;
    this.webcamProducer = undefined;
    this.screenProducer = undefined;
    this.screenAudioProducer = undefined;

    try {
      this.sendTransport?.close();
      this.recvTransport?.close();
    } catch {
      /* ignore */
    }
    this.sendTransport = undefined;
    this.recvTransport = undefined;

    if (!options.keepLocalStreams) {
      stopStream(this.micStream);
      stopStream(this.webcamStream);
      stopStream(this.screenStream);
      this.micStream = undefined;
      this.webcamStream = undefined;
      this.screenStream = undefined;
    }

    this.patch({ consumers: new Map() });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.teardownMedia();
    void this.media.releaseScreenCapture?.();
    this.signaling.close();
    this.patch({ joined: false, connection: 'closed' });
  }
}
