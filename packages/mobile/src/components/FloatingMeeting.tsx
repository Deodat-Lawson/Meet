import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration } from '@meet/protocol';
import { colors, radius } from '../theme';
import { MicOffIcon, ScreenShareIcon } from './Icons';
import { SpotlightVideo } from './SpotlightVideo';
import { isSpotlightMuted, pickSpotlight } from '../spotlight';
import { useT } from '../i18n';
import { useRoomStore } from '../store/roomStore';

/** Portrait for a face, landscape for a screen — the shape follows the content. */
const WEBCAM_SIZE = { width: 106, height: 150 };
const SCREEN_SIZE = { width: 170, height: 104 };

const EDGE_MARGIN = 12;
/** Movement beyond this many points is a drag, anything less is a tap. */
const DRAG_SLOP = 5;

interface FloatingMeetingProps {
  /** Start of the call, so the window can show how long it has been running. */
  startedAt: number;
  onExpand: () => void;
  /** Proportions of the video, for the system window this may become. */
  onVideoSize?: (width: number, height: number) => void;
}

/**
 * The meeting, collapsed into a window you can push around the screen.
 *
 * This is the in-app half of minimising: the rest of Team Studio is in front, the
 * call is untouched behind it, and the window is a live view of the same
 * connection rather than a snapshot of it. Nothing is written down for it to
 * work — collapse it, walk away, come back, and it is the same call because it
 * never stopped being the same call.
 *
 * The behaviour people already know from Zoom and WeChat, in the details:
 * drag it anywhere, let go and it settles against the nearer edge, tap it to
 * come back. A drag never triggers the tap, and the window never lands
 * underneath the status bar or the home indicator.
 */
export function FloatingMeeting({ startedAt, onExpand, onVideoSize }: FloatingMeetingProps) {
  const client = useRoomStore((state) => state.client);
  const room = useRoomStore((state) => state.room);
  const t = useT();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const spotlight = client && room ? pickSpotlight(client, room) : null;
  const size = spotlight?.source === 'screen' ? SCREEN_SIZE : WEBCAM_SIZE;

  /* ------------------------------------------------------------ placement */

  /* The window is absolutely positioned inside the safe-area view, so its
     origin already sits below the status bar: the insets shrink the space it
     may travel in rather than shifting where it starts. */
  const available = {
    width: screenWidth - insets.left - insets.right,
    height: screenHeight - insets.top - insets.bottom,
  };

  const bounds = useMemo(
    () => ({
      minX: EDGE_MARGIN,
      maxX: available.width - size.width - EDGE_MARGIN,
      minY: EDGE_MARGIN,
      maxY: available.height - size.height - EDGE_MARGIN,
    }),
    [available.width, available.height, size.width, size.height],
  );

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(Math.max(x, bounds.minX), Math.max(bounds.minX, bounds.maxX)),
      y: Math.min(Math.max(y, bounds.minY), Math.max(bounds.minY, bounds.maxY)),
    }),
    [bounds],
  );

  // Bottom right to start with, the corner a right thumb reaches without
  // covering anything that matters.
  const position = useRef({ x: bounds.maxX, y: bounds.maxY - 72 });
  const pan = useRef(new Animated.ValueXY(position.current)).current;

  useEffect(() => {
    const id = pan.addListener((value) => {
      position.current = value;
    });
    return () => pan.removeListener(id);
  }, [pan]);

  /* A rotation, a keyboard, or a switch to the wider screen-share shape can put
     the window out of bounds; walk it back rather than leaving it half off. */
  useEffect(() => {
    const settled = clamp(position.current.x, position.current.y);
    if (settled.x === position.current.x && settled.y === position.current.y) return;
    Animated.spring(pan, { toValue: settled, useNativeDriver: false, friction: 8, tension: 60 }).start();
  }, [clamp, pan]);

  const snapToEdge = useCallback(() => {
    const { x, y } = position.current;
    const centre = x + size.width / 2;
    const target = clamp(centre < available.width / 2 ? bounds.minX : bounds.maxX, y);
    Animated.spring(pan, {
      toValue: target,
      useNativeDriver: false,
      friction: 7,
      tension: 70,
    }).start();
  }, [available.width, bounds, clamp, pan, size.width]);

  const dragged = useRef(false);
  /* Held in a ref so a new callback identity never rebuilds the responder
     mid-gesture, which would drop the drag. */
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // The window owns the whole gesture rather than nesting a pressable
        // inside it: a tap is simply a drag that never moved, which is the only
        // way to be certain a flick of the thumb cannot also count as a tap.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragged.current = false;
          pan.extractOffset();
        },
        onPanResponderMove: (event, gesture) => {
          if (Math.abs(gesture.dx) > DRAG_SLOP || Math.abs(gesture.dy) > DRAG_SLOP) dragged.current = true;
          Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(event, gesture);
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          const settled = clamp(position.current.x, position.current.y);
          pan.setValue(settled);
          if (dragged.current) snapToEdge();
          else onExpandRef.current();
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          snapToEdge();
        },
      }),
    [clamp, pan, snapToEdge],
  );

  /* ------------------------------------------------------------- entrance */

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Off the native driver on purpose: this value shares a transform array
    // with the pan, which cannot be native because a gesture writes to it.
    Animated.spring(appear, { toValue: 1, useNativeDriver: false, friction: 7, tension: 80 }).start();
  }, [appear]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // The first real layout is the first chance to know the window fits where
      // it was put; sizes change with the content, insets arrive late.
      const { width, height } = event.nativeEvent.layout;
      if (width === 0 || height === 0) return;
      const settled = clamp(position.current.x, position.current.y);
      if (settled.x !== position.current.x || settled.y !== position.current.y) pan.setValue(settled);
    },
    [clamp, pan],
  );

  if (!client || !room || !spotlight) return null;

  const speaking = room.activeSpeakerId === spotlight.peer.id;
  const muted = isSpotlightMuted(spotlight, room);
  const label = `${t('mini.window')}. ${t('mini.tapToReturn')}`;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      onLayout={onLayout}
      style={[
        styles.window,
        size,
        speaking && styles.speaking,
        {
          transform: [
            ...pan.getTranslateTransform(),
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) },
          ],
          opacity: appear,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('mini.expand')}
      onAccessibilityTap={onExpand}
    >
      {/* While the meeting is collapsed this is the only remote video mounted,
          so on iOS it is also the one the system window is started from. */}
      <SpotlightVideo spotlight={spotlight} avatarSize={44} iosPictureInPicture onVideoSize={onVideoSize} />

      <View style={styles.topRow} pointerEvents="none">
        <View style={styles.durationChip}>
          <View style={styles.liveDot} />
          <Text style={styles.durationText}>{formatDuration(elapsed)}</Text>
        </View>
        {spotlight.source === 'screen' && (
          <View style={styles.badge}>
            <ScreenShareIcon size={11} color={colors.accent} />
          </View>
        )}
      </View>

      <View style={styles.bottomRow} pointerEvents="none">
        {muted && <MicOffIcon size={11} color={colors.danger} />}
        <Text style={styles.name} numberOfLines={1}>
          {spotlight.peer.displayName}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    // Sits above every screen, and above the sheets those screens open.
    zIndex: 100,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  speaking: { borderColor: colors.accent },
  topRow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.success },
  durationText: { color: colors.text, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  name: { color: colors.text, fontSize: 10.5, fontWeight: '500', flexShrink: 1 },
});
