import { Platform, PermissionsAndroid } from 'react-native';
import { mediaDevices } from 'react-native-webrtc';
import type { ClientPlatform } from '@meet/protocol';
import type { DeviceOption, DisplayMediaStreamOptions, MediaAdapter } from '@meet/client-core';
import { t } from '../i18n';

/**
 * React Native implementation of the platform media contract.
 *
 * Differences from the browser that this class absorbs so the shared room engine
 * does not have to know about them:
 *  - runtime permissions must be requested explicitly before capture;
 *  - `getDisplayMedia` takes react-native-webrtc's own constraint shape and is
 *    video-only (Android's MediaProjection audio capture is not exposed);
 *  - camera selection is by facingMode, not by deviceId.
 */
export class RNMediaAdapter implements MediaAdapter {
  readonly platform: ClientPlatform = Platform.OS === 'android' ? 'android' : 'ios';
  /** mediasoup-client cannot sniff React Native, so the handler is explicit. */
  readonly handlerName = 'ReactNative106';

  private cachedDevices: DeviceOption[] = [];

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    await this.ensurePermissions(Boolean(constraints.audio), Boolean(constraints.video));

    // react-native-webrtc accepts the standard shape but ignores browser-only
    // hints; passing them through is harmless and keeps one call site.
    //
    // The cast bridges react-native-webrtc's MediaStream (which omits the
    // EventTarget methods) to the DOM type the shared engine is written against.
    // registerGlobals() makes them the same object at runtime.
    const stream = await mediaDevices.getUserMedia(constraints as never);
    return stream as unknown as MediaStream;
  }

  async getDisplayMedia(_options: DisplayMediaStreamOptions): Promise<MediaStream> {
    if (Platform.OS !== 'android') {
      throw new Error(t('device.shareAndroidOnly'));
    }

    // Android 13+ needs notification permission before the MediaProjection
    // foreground service can post its mandatory ongoing notification.
    if (Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    }

    // Presenting the whole display keeps text legible; scaling down would make
    // shared slides unreadable on a phone-sized capture.
    const stream = await mediaDevices.getDisplayMedia({
      android: { createConfigForDefaultDisplay: true, resolutionScale: 1 },
    });
    return stream as unknown as MediaStream;
  }

  async enumerateDevices(): Promise<DeviceOption[]> {
    try {
      const devices = (await mediaDevices.enumerateDevices()) as unknown as Array<{
        deviceId: string;
        label?: string;
        kind: string;
        facing?: string;
      }>;

      this.cachedDevices = devices
        .filter((device) => device.kind === 'audioinput' || device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          kind: device.kind as DeviceOption['kind'],
          label:
            device.label ||
            (device.kind === 'videoinput'
              ? device.facing === 'environment'
                ? 'Back camera'
                : 'Front camera'
              : `Microphone ${index + 1}`),
        }));
      return this.cachedDevices;
    } catch {
      return this.cachedDevices;
    }
  }

  supportsDisplayMedia(): boolean {
    return Platform.OS === 'android';
  }

  supportsCameraSwitch(): boolean {
    return true;
  }

  /** Toggles between the earpiece and the loudspeaker. */
  async setSpeakerphone(enabled: boolean): Promise<void> {
    // react-native-webrtc routes audio through its own AudioDeviceModule; the
    // documented switch is on the InCallManager-style API surface it exposes.
    const rtc = (await import('react-native-webrtc')) as unknown as {
      setSpeakerphoneOn?: (on: boolean) => void;
    };
    rtc.setSpeakerphoneOn?.(enabled);
  }

  /**
   * Requests the runtime permissions capture needs.
   *
   * Android returns "never_ask_again" once a user has permanently denied, which
   * we surface as an actionable error rather than a silent no-op stream.
   */
  private async ensurePermissions(audio: boolean, video: boolean): Promise<void> {
    if (Platform.OS !== 'android') return;

    const wanted: Array<keyof typeof PermissionsAndroid.PERMISSIONS> = [];
    if (audio) wanted.push('RECORD_AUDIO');
    if (video) wanted.push('CAMERA');
    if (wanted.length === 0) return;

    const permissions = wanted.map((key) => PermissionsAndroid.PERMISSIONS[key]);
    const results = await PermissionsAndroid.requestMultiple(permissions);

    const denied = Object.entries(results)
      .filter(([, result]) => result !== PermissionsAndroid.RESULTS.GRANTED)
      .map(([permission]) => (permission.includes('CAMERA') ? 'camera' : 'microphone'));

    if (denied.length > 0) {
      // One name or both — "camera and microphone" is its own phrase because
      // joining two translated nouns with a translated "and" reads wrong in
      // languages that do not use a conjunction here.
      const device = t(
        denied.length > 1
          ? 'device.cameraAndMicrophone'
          : denied[0] === 'camera'
            ? 'device.camera'
            : 'device.microphone',
      );
      const blocked = Object.values(results).includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
      throw new Error(blocked ? t('device.permissionBlocked', { device }) : t('device.permissionNeeded', { device }));
    }
  }
}

export const rnMediaAdapter = new RNMediaAdapter();
