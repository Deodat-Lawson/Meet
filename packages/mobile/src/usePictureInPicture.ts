import { useCallback, useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { t as translate, useLocale } from './i18n';
import { pictureInPicture, type PipActionId } from './native/pictureInPicture';
import { useRoomStore } from './store/roomStore';

/**
 * Shape the window starts out as, before any video has reported its size.
 *
 * Guessing from what the meeting is showing beats guessing from nothing: a
 * shared screen is a landscape thing, a face on a phone usually a portrait one.
 * The guess is replaced by the video's real proportions as soon as the first
 * frame arrives, which — because the meeting reports them too, not only the
 * window — is long before anyone swipes the app away.
 */
const SCREEN_SHARE_ASPECT = { width: 16, height: 9 };
const WEBCAM_ASPECT = { width: 3, height: 4 };

interface Options {
  /** True while a meeting is on screen and worth keeping alive. */
  active: boolean;
  /** Ends the meeting and returns to the home screen. */
  onLeave: () => void;
}

/**
 * Connects the meeting to the platform's own small window.
 *
 * Three things have to stay in step for the window to feel like the one people
 * already know from Zoom: it has to be armed *before* the user swipes away,
 * since by then there is no time to ask; it has to carry the same two or three
 * controls the meeting has; and the call underneath has to survive being out of
 * sight, which on Android means holding the process in the foreground.
 *
 * None of it is remembered between meetings. The window is described afresh
 * every time from the meeting that is running, and torn down with it.
 */
export function usePictureInPicture({ active, onLeave }: Options) {
  /* Translated imperatively rather than through `useT`, whose translator is a
     fresh function on every render and would restart the notification with it.
     The locale itself is the dependency that matters. */
  const locale = useLocale();
  const room = useRoomStore((state) => state.room);
  const client = useRoomStore((state) => state.client);

  const micOn = Boolean(room && room.local.micEnabled && !room.local.micMuted);
  const cameraOn = Boolean(room?.local.cameraEnabled);
  const sharing = Boolean(client?.screenSharingPeerId);

  /* Where to go back to when the window closes: swiping away from a meeting
     that was already collapsed should not expand it on the way back. */
  const presentationBeforePip = useRef<'full' | 'mini'>('full');
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  /* ------------------------------------------------------------- arming */

  useEffect(() => {
    pictureInPicture.setEnabled(active);
    return () => pictureInPicture.setEnabled(false);
  }, [active]);

  /* A window is a view of a call. When the call goes — hung up from inside the
     window, or ended by a host while it was open — the window goes with it,
     rather than shrinking the home screen into a rectangle above someone's
     inbox. Whether there is a window to close is asked of the platform rather
     than of our own state, which by this point has already been reset. */
  useEffect(() => {
    if (!active) pictureInPicture.exitPictureInPicture();
  }, [active]);

  /* --------------------------------------------------------------- shape */

  useEffect(() => {
    if (!active) return;
    const aspect = sharing ? SCREEN_SHARE_ASPECT : WEBCAM_ASPECT;
    pictureInPicture.setAspectRatio(aspect.width, aspect.height);
  }, [active, sharing]);

  /**
   * The proportions of whatever the window would show, reported from wherever
   * it happens to be on screen — the meeting, the floating window, or the
   * window itself. Knowing them before the swipe is what stops the window
   * opening at one shape and correcting itself a moment later.
   */
  const reportVideoSize = useCallback((width: number, height: number) => {
    pictureInPicture.setAspectRatio(width, height);
  }, []);

  /* ------------------------------------------------------------ controls */

  useEffect(() => {
    if (!active) return;
    pictureInPicture.setActions([
      {
        id: 'mic',
        title: micOn ? translate('controls.mute') : translate('controls.unmute'),
        icon: micOn ? 'mic' : 'mic-off',
      },
      {
        id: 'camera',
        title: cameraOn ? translate('controls.stopVideo') : translate('controls.startVideo'),
        icon: cameraOn ? 'camera' : 'camera-off',
      },
      { id: 'leave', title: translate('controls.leave'), icon: 'leave' },
    ]);
    // `locale` is not read directly, but every title above was translated with it.
  }, [active, micOn, cameraOn, locale]);

  /* ---------------------------------------------------- staying connected */

  useEffect(() => {
    if (!active) return;

    /* Android 13 will run the service either way but silently drop its
       notification, which is the part the user needs to get back. */
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    }

    pictureInPicture.startOngoingCall({
      title: translate('mini.notificationTitle'),
      body: translate('mini.notificationBody'),
      channelName: translate('mini.notificationChannel'),
      channelDescription: translate('mini.notificationChannelBody'),
      leave: translate('controls.leave'),
    });
    return () => pictureInPicture.stopOngoingCall();
  }, [active, locale]);

  /* -------------------------------------------------------------- events */

  const applyWindowMode = useCallback((inWindow: boolean) => {
    const store = useRoomStore.getState();
    if (inWindow) {
      if (store.presentation !== 'pip') {
        presentationBeforePip.current = store.presentation === 'mini' ? 'mini' : 'full';
      }
      store.setPresentation('pip');
    } else if (store.presentation === 'pip') {
      store.setPresentation(presentationBeforePip.current);
    }
  }, []);

  useEffect(() => {
    const subscription = pictureInPicture.onModeChanged(applyWindowMode);
    return () => subscription.remove();
  }, [applyWindowMode]);

  /**
   * The same question, asked again whenever the app changes hands.
   *
   * The mode-change callback crosses from the platform to JavaScript at the one
   * moment the system is busy moving the app into or out of a window, and it
   * does not always arrive. When it does not, the full meeting interface — a
   * header, a control bar, a language toggle — ends up rendering into a window
   * a few centimetres across. Re-reading the mode on every foreground and
   * background settles it, from the JavaScript side, where nothing is in
   * flight.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', () => {
      applyWindowMode(pictureInPicture.isInPictureInPicture());
    });
    return () => subscription.remove();
  }, [applyWindowMode]);

  useEffect(() => {
    const subscription = pictureInPicture.onAction((id: PipActionId) => {
      const current = useRoomStore.getState().client;
      if (id === 'leave') {
        onLeaveRef.current();
        return;
      }
      if (!current) return;
      if (id === 'mic') void current.toggleMic();
      if (id === 'camera') void current.toggleCamera();
    });
    return () => subscription.remove();
  }, []);

  return { reportVideoSize };
}
