import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { PreJoinScreen } from './src/screens/PreJoinScreen';
import { MeetingScreen } from './src/screens/MeetingScreen';
import { PipScreen } from './src/screens/PipScreen';
import { FloatingMeeting } from './src/components/FloatingMeeting';
import { useRoomStore } from './src/store/roomStore';
import { CloseIcon } from './src/components/Icons';
import { LanguageToggle } from './src/components/LanguageToggle';
import { useT, useTranslatable } from './src/i18n';
import { pictureInPicture } from './src/native/pictureInPicture';
import { usePictureInPicture } from './src/usePictureInPicture';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const { status, fatalError, toasts, dismissToast, leave, presentation, minimize, restore } = useRoomStore();
  const t = useT();
  const text = useTranslatable();

  const inMeeting = Boolean(roomId) && (status === 'joined' || status === 'lobby');

  /* One start time for the whole call, so the timer in the meeting and the one
     in the floating window agree, and neither restarts on the way back. */
  const startedAt = useRef(0);
  if (inMeeting && startedAt.current === 0) startedAt.current = Date.now();
  if (!inMeeting && startedAt.current !== 0) startedAt.current = 0;

  const goHome = useCallback(() => {
    leave();
    setRoomId(null);
    useRoomStore.setState({ status: 'idle', fatalError: null });
  }, [leave]);

  const { reportVideoSize } = usePictureInPicture({ active: inMeeting, onLeave: goHome });

  /**
   * Android back, in order of least surprise: close what is open, then collapse
   * the meeting rather than end it — the same as pressing back in Zoom — then
   * step out to the system window, which is where "back" and "swipe away" mean
   * the same thing. Only outside a meeting does back leave the app.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const store = useRoomStore.getState();
      if (store.panel !== 'none') {
        store.setPanel('none');
        return true;
      }
      if (!roomId || !store.client) return false;
      if (store.presentation === 'full') {
        store.minimize();
        return true;
      }
      if (store.presentation === 'mini') {
        // Leaving the app entirely would end the call, so back hands it to the
        // system window instead. Where there is no such window, say so rather
        // than quietly hanging up on everyone.
        if (pictureInPicture.isSupported()) pictureInPicture.enter();
        else store.pushToast({ key: 'mini.pipUnavailable' }, 'info');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [roomId]);

  /* --------------------------------------------------- the small window */

  if (inMeeting && presentation === 'pip') {
    return (
      <SafeAreaProvider>
        <View style={styles.pipRoot}>
          <PipScreen onVideoSize={reportVideoSize} />
        </View>
      </SafeAreaProvider>
    );
  }

  let content: React.ReactNode;
  if (!roomId || (inMeeting && presentation === 'mini')) {
    content = (
      <HomeScreen
        onOpenRoom={setRoomId}
        meetingInProgress={inMeeting && presentation === 'mini'}
        onReturnToMeeting={restore}
      />
    );
  } else if (status === 'joined' || status === 'lobby') {
    content = (
      <MeetingScreen
        roomId={roomId}
        startedAt={startedAt.current}
        onLeave={goHome}
        onMinimize={minimize}
        onSpotlightVideoSize={reportVideoSize}
      />
    );
  } else if (status === 'left' || status === 'error') {
    content = (
      <View style={styles.ended}>
        <LanguageToggle style={styles.endedLanguage} />
        <Text style={styles.endedTitle}>{t('room.leftTitle')}</Text>
        <Text style={styles.endedText}>{fatalError ? text(fatalError) : t('room.leftSubtitle')}</Text>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => useRoomStore.setState({ status: 'idle', fatalError: null })}
        >
          <Text style={styles.buttonPrimaryText}>{t('mobile.rejoin')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={goHome}>
          <Text style={styles.buttonText}>{t('room.backHome')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    content = <PreJoinScreen roomId={roomId} onCancel={goHome} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {content}

        {inMeeting && presentation === 'mini' && (
          <FloatingMeeting startedAt={startedAt.current} onExpand={restore} onVideoSize={reportVideoSize} />
        )}

        <View style={styles.toasts} pointerEvents="box-none">
          {toasts.map((toast) => (
            <View
              key={toast.id}
              style={[
                styles.toast,
                toast.tone === 'error' && styles.toastError,
                toast.tone === 'success' && styles.toastSuccess,
              ]}
            >
              <Text style={styles.toastText}>{text(toast.content)}</Text>
              <TouchableOpacity onPress={() => dismissToast(toast.id)} accessibilityLabel={t('common.dismiss')}>
                <CloseIcon size={16} color={colors.textDim} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // No safe area and no chrome: the system window has neither.
  pipRoot: { flex: 1, backgroundColor: colors.black },
  ended: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  endedLanguage: { alignSelf: 'center', marginBottom: spacing.lg },
  endedTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  endedText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: spacing.lg },
  button: {
    height: 48,
    minWidth: 220,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toasts: {
    position: 'absolute',
    bottom: 90,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastError: { backgroundColor: '#3a1d19', borderColor: 'rgba(232,80,58,0.45)' },
  toastSuccess: { backgroundColor: '#142e1f', borderColor: 'rgba(34,197,94,0.4)' },
  toastText: { color: colors.text, fontSize: 13.5, flex: 1 },
});
