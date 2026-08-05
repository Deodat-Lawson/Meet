import os from 'node:os';
import { config as loadEnv } from 'dotenv';
import type { types as mediasoupTypes } from 'mediasoup';
import { ROUTER_CODECS } from '@meet/protocol';

loadEnv();

function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback === undefined) throw new Error(`Missing required environment variable ${key}`);
    return fallback;
  }
  return value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${key} must be an integer`);
  return n;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * The address remote peers should send media to. Inside Docker or behind NAT this
 * must be set explicitly; on a developer laptop the primary LAN address is the
 * right answer and lets phones on the same Wi-Fi connect without extra setup.
 */
function detectAnnouncedIp(): string {
  const explicit = process.env.MEDIASOUP_ANNOUNCED_IP;
  if (explicit) return explicit;

  const interfaces = os.networkInterfaces();
  // Prefer the interface that the default route would use: en0 on macOS, eth0 on Linux.
  const preferred = ['en0', 'eth0', 'wlan0', 'wlp2s0'];
  for (const name of [...preferred, ...Object.keys(interfaces)]) {
    for (const info of interfaces[name] ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

const announcedIp = detectAnnouncedIp();

export const config = {
  env: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',

  http: {
    host: env('HOST', '0.0.0.0'),
    port: envInt('PORT', 4000),
    /** Serve the built web client from the API process (single-container deploys). */
    serveStatic: envBool('SERVE_STATIC', false),
    staticDir: env('STATIC_DIR', '../web/dist'),
    corsOrigins: env('CORS_ORIGINS', '*')
      .split(',')
      .map((s) => s.trim()),
    /** Behind a TLS-terminating proxy this stays false. */
    tls: envBool('HTTPS', false),
    tlsCert: process.env.TLS_CERT_PATH,
    tlsKey: process.env.TLS_KEY_PATH,
  },

  auth: {
    jwtSecret: env('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
    tokenTtlSeconds: envInt('TOKEN_TTL_SECONDS', 60 * 60 * 12),
  },

  room: {
    maxPeers: envInt('ROOM_MAX_PEERS', 100),
    /** Rooms with no peers are destroyed after this grace period. */
    emptyRoomTtlMs: envInt('EMPTY_ROOM_TTL_MS', 60_000),
    chatHistoryLimit: envInt('CHAT_HISTORY_LIMIT', 200),
    /** Peers that fail to complete `join` within this window are disconnected. */
    joinTimeoutMs: envInt('JOIN_TIMEOUT_MS', 30_000),
  },

  mediasoup: {
    numWorkers: envInt('MEDIASOUP_WORKERS', Math.max(1, os.cpus().length - 1)),
    workerSettings: {
      logLevel: env('MEDIASOUP_LOG_LEVEL', 'warn') as mediasoupTypes.WorkerLogLevel,
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'rtx',
        'bwe',
        'score',
        'simulcast',
        'svc',
        'sctp',
      ] as mediasoupTypes.WorkerLogTag[],
      rtcMinPort: envInt('MEDIASOUP_MIN_PORT', 40000),
      rtcMaxPort: envInt('MEDIASOUP_MAX_PORT', 49999),
    } satisfies mediasoupTypes.WorkerSettings,

    routerOptions: {
      mediaCodecs: ROUTER_CODECS as unknown as mediasoupTypes.RtpCodecCapability[],
    } satisfies mediasoupTypes.RouterOptions,

    webRtcServer: {
      /** One shared WebRtcServer per worker: a single UDP+TCP port pair per worker. */
      enabled: envBool('MEDIASOUP_USE_WEBRTC_SERVER', true),
      basePort: envInt('MEDIASOUP_WEBRTC_SERVER_PORT', 44444),
    },

    webRtcTransportOptions: {
      listenInfos: [
        {
          protocol: 'udp' as const,
          ip: env('MEDIASOUP_LISTEN_IP', '0.0.0.0'),
          announcedAddress: announcedIp,
          portRange: { min: envInt('MEDIASOUP_MIN_PORT', 40000), max: envInt('MEDIASOUP_MAX_PORT', 49999) },
        },
        {
          protocol: 'tcp' as const,
          ip: env('MEDIASOUP_LISTEN_IP', '0.0.0.0'),
          announcedAddress: announcedIp,
          portRange: { min: envInt('MEDIASOUP_MIN_PORT', 40000), max: envInt('MEDIASOUP_MAX_PORT', 49999) },
        },
      ],
      initialAvailableOutgoingBitrate: envInt('MEDIASOUP_INITIAL_BITRATE', 1_500_000),
      maxSendMessageSize: 262_144,
      maxReceiveMessageSize: 262_144,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      enableSctp: true,
      /** Seconds without ICE consent before mediasoup tears the transport down. */
      iceConsentTimeout: envInt('MEDIASOUP_ICE_CONSENT_TIMEOUT', 30),
    },

    plainTransportOptions: {
      listenInfo: {
        protocol: 'udp' as const,
        ip: env('MEDIASOUP_LISTEN_IP', '127.0.0.1'),
        announcedAddress: '127.0.0.1',
        portRange: { min: envInt('MEDIASOUP_RECORD_MIN_PORT', 50000), max: envInt('MEDIASOUP_RECORD_MAX_PORT', 50999) },
      },
      rtcpMux: false,
      comedia: false,
    },

    announcedIp,
  },

  /** ICE servers handed to clients. A TURN server is mandatory for real networks. */
  iceServers: (() => {
    const servers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];
    const stun = env('STUN_URLS', 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302');
    if (stun) servers.push({ urls: stun.split(',').map((s) => s.trim()) });
    const turnUrls = process.env.TURN_URLS;
    if (turnUrls) {
      servers.push({
        urls: turnUrls.split(',').map((s) => s.trim()),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      });
    }
    return servers;
  })(),

  recording: {
    enabled: envBool('RECORDING_ENABLED', true),
    outputDir: env('RECORDING_DIR', './recordings'),
    ffmpegPath: env('FFMPEG_PATH', 'ffmpeg'),
  },

  logLevel: env('LOG_LEVEL', 'info'),
} as const;

export type Config = typeof config;
