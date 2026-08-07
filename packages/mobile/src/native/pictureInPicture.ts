import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';
import NativeMeetPip, { type OngoingCallLabels, type PipAction } from '../../specs/NativeMeetPip';

/**
 * The system window, from JavaScript.
 *
 * Every call here is a no-op where the platform has nothing to offer — iOS
 * drives its own Picture-in-Picture from the video view rather than from a
 * module, and Android below 8.0 has no such window at all. Callers can say what
 * they want unconditionally and let this decide whether anything happens.
 */

/** Buttons the system draws in the window; ids come back on `onAction`. */
export type PipActionId = 'mic' | 'camera' | 'leave';

export const pictureInPicture = {
  isSupported(): boolean {
    return NativeMeetPip?.isSupported() ?? false;
  },

  isInPictureInPicture(): boolean {
    return NativeMeetPip?.isInPictureInPicture() ?? false;
  },

  setEnabled(enabled: boolean): void {
    NativeMeetPip?.setEnabled(enabled);
  },

  setAspectRatio(width: number, height: number): void {
    if (width > 0 && height > 0) NativeMeetPip?.setAspectRatio(width, height);
  },

  setSourceRect(x: number, y: number, width: number, height: number): void {
    if (width > 0 && height > 0) NativeMeetPip?.setSourceRect(x, y, width, height);
  },

  setActions(actions: PipAction[]): void {
    NativeMeetPip?.setActions(actions);
  },

  enter(): void {
    NativeMeetPip?.enter();
  },

  exitPictureInPicture(): void {
    NativeMeetPip?.exitPictureInPicture();
  },

  startOngoingCall(labels: OngoingCallLabels): void {
    NativeMeetPip?.startOngoingCall(labels);
  },

  stopOngoingCall(): void {
    NativeMeetPip?.stopOngoingCall();
  },

  /** Fires when the OS puts the app into, or takes it out of, the window. */
  onModeChanged(listener: (active: boolean) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener('MeetPip:modeChanged', (event: { active: boolean }) =>
      listener(Boolean(event?.active)),
    );
  },

  /** Fires when a button in the window — or in the notification — is tapped. */
  onAction(listener: (id: PipActionId) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener('MeetPip:action', (event: { id: PipActionId }) => {
      if (event?.id) listener(event.id);
    });
  },
};

export type { OngoingCallLabels, PipAction };
