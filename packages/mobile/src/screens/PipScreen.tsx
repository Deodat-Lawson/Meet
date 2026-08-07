import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { MicOffIcon } from '../components/Icons';
import { SpotlightVideo } from '../components/SpotlightVideo';
import { isSpotlightMuted, pickSpotlight } from '../spotlight';
import { useT } from '../i18n';
import { useRoomStore } from '../store/roomStore';

/**
 * What the meeting looks like inside the system's own small window.
 *
 * A Picture-in-Picture window is a few centimetres of screen borrowed from
 * whatever the user actually opened, so this is deliberately almost empty: one
 * video, one name, and the two states you would want to know without going back
 * — that someone is muted, and that the connection is in trouble. The controls
 * live in the window's own action row, which the system draws on top of this
 * view when it is tapped, so drawing our own would be drawing them twice.
 */
export function PipScreen({ onVideoSize }: { onVideoSize?: (width: number, height: number) => void }) {
  const client = useRoomStore((state) => state.client);
  const room = useRoomStore((state) => state.room);
  const reactions = useRoomStore((state) => state.reactions);
  const t = useT();

  const spotlight = client && room ? pickSpotlight(client, room) : null;
  if (!room || !spotlight) return <View style={styles.root} />;

  const reconnecting = room.connection === 'reconnecting' || room.connection === 'connecting';

  return (
    <View style={styles.root}>
      <SpotlightVideo spotlight={spotlight} avatarSize={64} onVideoSize={onVideoSize} />

      {reconnecting && (
        <View style={styles.topChip}>
          <Text style={styles.topChipText}>{t('room.reconnecting')}</Text>
        </View>
      )}

      <View style={styles.nameRow}>
        {isSpotlightMuted(spotlight, room) && <MicOffIcon size={13} color={colors.danger} />}
        <Text style={styles.name} numberOfLines={1}>
          {spotlight.peer.displayName}
        </Text>
      </View>

      {reactions.length > 0 && (
        <View style={styles.reactions} pointerEvents="none">
          <Text style={styles.reactionEmoji}>{reactions[reactions.length - 1].emoji}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  topChip: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  topChipText: { color: colors.warn, fontSize: 11, fontWeight: '600' },
  nameRow: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  name: { color: colors.text, fontSize: 12, fontWeight: '500', flexShrink: 1 },
  reactions: { position: 'absolute', right: 8, bottom: 28 },
  reactionEmoji: { fontSize: 26 },
});
