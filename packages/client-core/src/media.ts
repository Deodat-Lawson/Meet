import type { ClientPlatform } from '@meet/protocol';

export interface DeviceOption {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

/**
 * Everything the room engine needs from the host platform's media stack.
 *
 * The web adapter wraps `navigator.mediaDevices`; the React Native adapter wraps
 * `react-native-webrtc`. Keeping capture behind this interface is what lets the
 * entire room/SFU engine be shared byte-for-byte between the two apps.
 */
export interface MediaAdapter {
  readonly platform: ClientPlatform;
  /** mediasoup-client handler override. Undefined lets the library auto-detect. */
  readonly handlerName?: string;

  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>;
  enumerateDevices(): Promise<DeviceOption[]>;

  /** False on platforms where screen capture needs a different entry point. */
  supportsDisplayMedia(): boolean;
  /** True where a front/back toggle makes sense (phones). */
  supportsCameraSwitch(): boolean;
  /** Route audio to the loudspeaker vs earpiece (mobile only). */
  setSpeakerphone?(enabled: boolean): Promise<void>;
  /** Choose an output device (browsers with setSinkId). */
  setAudioOutput?(deviceId: string, element?: HTMLMediaElement): Promise<void>;
  /** Android needs a foreground service running before MediaProjection starts. */
  prepareScreenCapture?(): Promise<void>;
  releaseScreenCapture?(): Promise<void>;
}

export type DisplayMediaStreamOptions = {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
};

export function stopStream(stream?: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  }
}
