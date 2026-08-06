import type { ClientPlatform } from '@meet/protocol';
import type { DeviceOption, DisplayMediaStreamOptions, MediaAdapter } from '@meet/client-core';
import { t } from '../i18n';

/**
 * Browser implementation of the platform media contract.
 *
 * Two browser-specific details are handled here rather than in the shared engine:
 * device labels are empty until permission has been granted at least once, and
 * `setSinkId` (output routing) only exists in Chromium.
 */
export class WebMediaAdapter implements MediaAdapter {
  readonly platform: ClientPlatform = 'web';
  /** Undefined lets mediasoup-client pick the right handler for this browser. */
  readonly handlerName = undefined;

  private audioElements = new Set<HTMLMediaElement>();
  private currentSinkId?: string;

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t('device.unsupportedBrowser'));
    }
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw new Error(describeGetUserMediaError(error, constraints));
    }
  }

  async getDisplayMedia(options: DisplayMediaStreamOptions): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error(t('device.shareUnsupported'));
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: options.video ?? true,
      audio: options.audio ?? false,
      // Keep the "share this tab instead" affordance and hide the self-preview loop.
      ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' } as object),
    } as MediaStreamConstraints);
  }

  async enumerateDevices(): Promise<DeviceOption[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput' || d.kind === 'audiooutput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        kind: d.kind as DeviceOption['kind'],
        // Labels are blank until the user has granted permission once.
        label: d.label || `${labelForKind(d.kind)} ${index + 1}`,
      }));
  }

  supportsDisplayMedia(): boolean {
    return Boolean(navigator.mediaDevices?.getDisplayMedia);
  }

  supportsCameraSwitch(): boolean {
    // Desktop browsers expose multiple cameras as separate devices instead.
    return /Mobi|Android/i.test(navigator.userAgent);
  }

  /** Registers an <audio>/<video> element so output routing applies to it. */
  registerAudioElement(element: HTMLMediaElement): () => void {
    this.audioElements.add(element);
    if (this.currentSinkId) void applySinkId(element, this.currentSinkId);
    return () => this.audioElements.delete(element);
  }

  async setAudioOutput(deviceId: string, element?: HTMLMediaElement): Promise<void> {
    this.currentSinkId = deviceId;
    const targets = element ? [element] : [...this.audioElements];
    await Promise.all(targets.map((el) => applySinkId(el, deviceId)));
  }

  get supportsAudioOutputSelection(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }
}

async function applySinkId(element: HTMLMediaElement, deviceId: string): Promise<void> {
  const withSink = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof withSink.setSinkId !== 'function') return;
  try {
    await withSink.setSinkId(deviceId);
  } catch (error) {
    console.warn('[media] could not set audio output', error);
  }
}

function labelForKind(kind: string): string {
  if (kind === 'audioinput') return 'Microphone';
  if (kind === 'videoinput') return 'Camera';
  return 'Speaker';
}

/**
 * Turns the browser's terse DOMException names into something a user can act on.
 *
 * Translated here rather than at render time: by the time this reaches the UI it
 * is an ordinary `Error`, indistinguishable from one the browser itself wrote.
 */
function describeGetUserMediaError(error: unknown, constraints: MediaStreamConstraints): string {
  const device = t(
    constraints.video ? (constraints.audio ? 'device.cameraAndMicrophone' : 'device.camera') : 'device.microphone',
  );
  if (!(error instanceof Error)) return t('device.accessFailed', { device });

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return t('device.blocked', { device });
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return t('device.notFound', { device });
    case 'NotReadableError':
    case 'TrackStartError':
      return t('device.inUse', { device });
    case 'OverconstrainedError':
      return t('device.overconstrained', { device });
    case 'SecurityError':
      return t('device.insecure');
    default:
      return t('device.accessFailedDetail', { device, detail: error.message });
  }
}

export const webMediaAdapter = new WebMediaAdapter();
