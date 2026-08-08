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
 *
 * No `dtx` here: discontinuous transmission is an audio feature. It was accepted
 * silently and did nothing.
 */
export const SCREEN_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 2, maxBitrate: 800_000, scalabilityMode: 'L1T2' },
  { scaleResolutionDownBy: 1, maxBitrate: 4_000_000, scalabilityMode: 'L1T2' },
];

export const SCREEN_SVC_ENCODINGS = [{ maxBitrate: 4_000_000, scalabilityMode: 'L2T3' }];

/**
 * What is being shared, which decides what to sacrifice when the link cannot
 * carry everything.
 *
 * This is the single most important thing to get right about a screen share,
 * and it is invisible until it is wrong. WebRTC's default behaviour is tuned
 * for a talking head: under pressure it holds the frame rate and drops
 * resolution, because a smooth blurry face still reads as a face. Apply that to
 * a slide of source code and you get thirty crisp frames a second of text
 * nobody can read.
 *
 *  - `text`   an IDE, a document, a slide. Hold resolution, let the frame rate
 *             collapse to nothing if it must — a still, sharp screen is exactly
 *             what the viewer wants.
 *  - `motion` a video, an animation, a game. Now smoothness is the point and
 *             softening the picture is the right trade.
 */
export type ScreenShareMode = 'text' | 'motion';

/**
 * The hint handed to the encoder, and the reason this matters more than the
 * bitrate ladder does.
 *
 * Browsers map `contentHint` onto the encoder's rate control *and* onto its
 * degradation preference, so setting it correctly fixes several things at once
 * that cannot otherwise be reached through mediasoup's API.
 */
export const SCREEN_CONTENT_HINT: Record<ScreenShareMode, 'detail' | 'motion'> = {
  text: 'detail',
  motion: 'motion',
};

/**
 * Belt and braces for the above. Chrome infers this from `contentHint`; not
 * every engine does, and it is the setting that actually decides whether text
 * survives a congested link.
 */
export const SCREEN_DEGRADATION_PREFERENCE: Record<ScreenShareMode, RTCDegradationPreference> = {
  text: 'maintain-resolution',
  motion: 'balanced',
};

/** Constraints used when opening the local camera. */
export const VIDEO_CONSTRAINTS = {
  low: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 15, max: 20 } },
  medium: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
  high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
  hd1080: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
} as const;

export type VideoQuality = keyof typeof VIDEO_CONSTRAINTS;

/**
 * Screen capture constraints — high resolution, frame rate chosen by mode.
 *
 * Capturing at 30 for text as well is deliberate: the old 15 was a *capture*
 * cap, which throws frames away before the encoder can decide whether it could
 * afford them. Ask for 30 and let the encoder drop what the link cannot carry —
 * with `maintain-resolution` it drops frames rather than sharpness, so a still
 * screen stays crisp and a scrolling one stays readable.
 */
export const SCREEN_FRAME_RATES: Record<ScreenShareMode, MediaTrackConstraints['frameRate']> = {
  text: { ideal: 30, max: 30 },
  motion: { ideal: 30, max: 60 },
};

export const SCREEN_CONSTRAINTS = {
  video: {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { ideal: 30, max: 30 },
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
  // Two layers means a screen share, where the lower one is half resolution —
  // 960 wide from a 1080p desktop, which is where text stops being readable
  // rather than merely soft. The threshold is lower than the webcam ladder's on
  // purpose: it is worth spending bitrate to cross it.
  if (layers === 2) return width >= 480 ? 1 : 0;
  if (width >= 960) return 2;
  if (width >= 400) return 1;
  return 0;
}
