import { Platform } from 'react-native';
import type { ProducerSource } from '@meet/protocol';

/**
 * iOS shrinks a *video view* into its Picture-in-Picture window, not a screen.
 *
 * That is the whole difference between the two platforms. Android hands the
 * activity to the system and lets React draw whatever it likes inside the small
 * window — which is what `PipScreen` is for. iOS takes the frames straight from
 * one video view and draws them itself, so the only decision left is which view
 * gets to be that one, and how big the window should start out.
 *
 * The answer is never a local view: the camera stops the moment the app leaves
 * the foreground, so a self-view would freeze exactly when the window became
 * useful.
 */
const PORTRAIT = { width: 240, height: 320 };
const LANDSCAPE = { width: 320, height: 180 };

export function iosPipOptions(source: ProducerSource, isLocal: boolean) {
  if (Platform.OS !== 'ios' || isLocal) return undefined;
  return {
    enabled: true,
    startAutomatically: true,
    stopAutomatically: true,
    preferredSize: source === 'screen' ? LANDSCAPE : PORTRAIT,
  };
}
