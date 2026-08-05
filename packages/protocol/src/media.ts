/**
 * Media configuration shared by the SFU router and both clients.
 *
 * Keeping the codec list and the simulcast ladders in one place guarantees the
 * client never proposes an encoding the router cannot forward.
 */

/** Router codec list. Order matters: the first match wins during negotiation. */
export const ROUTER_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      // Discontinuous transmission: stops sending during silence, big win at scale.
      usedtx: 1,
      useinbandfec: 1,
      'sprop-stereo': 1,
      minptime: 10,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
] as const;

/**
 * Three-layer simulcast ladder for the webcam. Matches the ladder Chrome
 * produces natively so the encoder never has to re-scale awkward ratios.
 */
export const WEBCAM_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 4, maxBitrate: 180_000, scalabilityMode: 'L1T3' },
  { scaleResolutionDownBy: 2, maxBitrate: 500_000, scalabilityMode: 'L1T3' },
  { scaleResolutionDownBy: 1, maxBitrate: 1_500_000, scalabilityMode: 'L1T3' },
];

/** VP9 SVC alternative, used when the client negotiates VP9. */
export const WEBCAM_SVC_ENCODINGS = [{ maxBitrate: 1_500_000, scalabilityMode: 'L3T3_KEY' }];

/**
 * Screen share ladder. Two spatial layers only: a legible thumbnail and full
 * resolution. Text content needs bitrate more than it needs frame rate, so the
 * top layer gets a generous ceiling.
 */
export const SCREEN_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 2, maxBitrate: 800_000, scalabilityMode: 'L1T2', dtx: true },
  { scaleResolutionDownBy: 1, maxBitrate: 4_000_000, scalabilityMode: 'L1T2', dtx: true },
];

export const SCREEN_SVC_ENCODINGS = [{ maxBitrate: 4_000_000, scalabilityMode: 'L2T3', dtx: true }];

/** Constraints used when opening the local camera. */
export const VIDEO_CONSTRAINTS = {
  low: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 15, max: 20 } },
  medium: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
  high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
  hd1080: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
} as const;

export type VideoQuality = keyof typeof VIDEO_CONSTRAINTS;

/** Screen capture constraints — high resolution, moderate frame rate. */
export const SCREEN_CONSTRAINTS = {
  video: {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { ideal: 15, max: 30 },
  },
  audio: {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
    sampleRate: 48000,
  },
} as const;

/** Mic constraints. AGC/NS/AEC on by default — this is a meeting, not a studio. */
export const AUDIO_CONSTRAINTS = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
} as const;

export const OPUS_PRODUCER_OPTIONS = {
  opusStereo: false,
  opusDtx: true,
  opusFec: true,
  opusPtime: 20,
  opusMaxPlaybackRate: 48000,
};

/** Screen-share audio should stay stereo and full-band (it is often music/video). */
export const OPUS_SCREEN_AUDIO_OPTIONS = {
  opusStereo: true,
  opusDtx: false,
  opusFec: true,
  opusPtime: 20,
  opusMaxPlaybackRate: 48000,
  opusMaxAverageBitrate: 128_000,
};

/**
 * Maps a rendered tile's width in CSS pixels to the simulcast spatial layer that
 * should be requested. Keeps the SFU from pushing 720p into a 160px thumbnail.
 */
export function spatialLayerForWidth(width: number, layers = 3): number {
  if (layers <= 1) return 0;
  if (layers === 2) return width >= 640 ? 1 : 0;
  if (width >= 960) return 2;
  if (width >= 400) return 1;
  return 0;
}
