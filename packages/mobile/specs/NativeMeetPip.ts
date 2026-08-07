import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * A button drawn inside the system's Picture-in-Picture window.
 *
 * The title arrives already translated: the window is part of the app's
 * interface, and the app knows which language the user chose. `icon` names one
 * of the vectors in `res/drawable`, because the system draws these itself and
 * cannot be handed a React component.
 */
export type PipAction = {
  id: string;
  title: string;
  icon: string;
};

/**
 * Wording for the ongoing-call notification.
 *
 * Every line is passed in rather than kept in `strings.xml` for the same reason
 * the action titles are: one dictionary, one language switch. Nothing here
 * names the room or the people in it — a notification is the one part of a
 * meeting that outlives the screen it was drawn on.
 */
export type OngoingCallLabels = {
  title: string;
  body: string;
  channelName: string;
  channelDescription: string;
  leave: string;
};

export interface Spec extends TurboModule {
  /** Whether this device can put the meeting in a window over other apps. */
  isSupported(): boolean;
  /**
   * Whether the meeting is in that window *right now*.
   *
   * The mode-change callback is the fast path, but it is a message in flight at
   * the exact moment the system is moving the app around, and a missed one
   * leaves the full meeting interface rendering into a window the size of a
   * stamp. This is the same answer asked for directly, so the app can settle
   * any doubt from the JavaScript side rather than trusting a notification it
   * may never have received.
   */
  isInPictureInPicture(): boolean;
  /**
   * Arms the window. While armed, swiping the app away shrinks the meeting
   * into a window instead of hiding it; disarmed, the app just goes away.
   */
  setEnabled(enabled: boolean): void;
  /** The window's shape. Clamped to the range the platform accepts. */
  setAspectRatio(width: number, height: number): void;
  /** Where the meeting is on screen, so the shrink animates from it. */
  setSourceRect(x: number, y: number, width: number, height: number): void;
  setActions(actions: ReadonlyArray<PipAction>): void;
  /**
   * Shrinks to the window now — the Minimize button rather than a swipe.
   *
   * Nothing is reported back: whether the window opened is answered by the
   * platform's own mode-change callback, which is the only account of it that
   * cannot disagree with what is on screen.
   */
  enter(): void;
  /**
   * Closes the window, if the meeting is in one.
   *
   * A window is a view of a call, so it cannot outlive one: hanging up from
   * inside it, or a host ending the meeting while it is open, has to take the
   * window with it. Closing means finishing the activity, which is exactly what
   * the window's own close button does — the app goes away and the user is left
   * where they already were, rather than being dragged back into it.
   */
  exitPictureInPicture(): void;
  /**
   * Holds the process in the foreground for as long as the call lasts, with the
   * ongoing notification Android requires in exchange. Without it the system is
   * free to stop our microphone the moment the window is dismissed.
   */
  startOngoingCall(labels: OngoingCallLabels): void;
  stopOngoingCall(): void;
}

export default TurboModuleRegistry.get<Spec>('MeetPip');
