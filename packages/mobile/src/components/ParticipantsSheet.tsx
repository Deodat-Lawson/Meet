import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colorForPeer, initialsFor, type PeerInfo } from '@meet/protocol';
import type { RoomClient, RoomState } from '@meet/client-core';
import { colors, radius, spacing } from '../theme';
import { CloseIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, ScreenShareIcon, VideoIcon, VideoOffIcon } from './Icons';
import { useRoomStore } from '../store/roomStore';

export function ParticipantsSheet({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const [menuFor, setMenuFor] = useState<PeerInfo | null>(null);

  const self = room.self;
  const isModerator = self?.role === 'host' || self?.role === 'co-host';

  const peers = [...room.peers.values()].sort((a, b) => {
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });
  const data = self ? [self, ...peers] : peers;

  const act = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      pushToast(label, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Action failed', 'error');
    } finally {
      setMenuFor(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setPanel('none')}>
      <Pressable style={styles.backdrop} onPress={() => setPanel('none')}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Participants ({data.length})</Text>
            <TouchableOpacity onPress={() => setPanel('none')} accessibilityLabel="Close">
              <CloseIcon size={20} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {room.lobbyPeers.length > 0 && isModerator && (
            <View style={styles.lobbySection}>
              <Text style={styles.sectionLabel}>WAITING TO JOIN</Text>
              {room.lobbyPeers.map((peer) => (
                <View key={peer.id} style={styles.row}>
                  <Avatar id={peer.id} name={peer.displayName} />
                  <Text style={styles.name} numberOfLines={1}>
                    {peer.displayName}
                  </Text>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.smallButtonPrimary]}
                    onPress={() => void act('Admitted', () => client.admitLobbyPeer(peer.id, true))}
                  >
                    <Text style={styles.smallButtonPrimaryText}>Admit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={() => void act('Denied', () => client.admitLobbyPeer(peer.id, false))}
                  >
                    <Text style={styles.smallButtonText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelf = item.id === self?.id;
              return (
                <View style={styles.row}>
                  <Avatar id={item.id} name={item.displayName} level={room.audioLevels.get(item.id) ?? 0} />
                  <View style={styles.nameWrap}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.displayName}
                      {isSelf ? ' (you)' : ''}
                    </Text>
                    {item.role !== 'participant' && (
                      <Text style={styles.role}>{item.role === 'host' ? 'Host' : 'Co-host'}</Text>
                    )}
                  </View>

                  {item.handRaised && <HandIcon size={16} color="#ffd166" />}
                  {item.screenSharing && <ScreenShareIcon size={16} color={colors.accent} />}
                  {item.audioEnabled ? (
                    <MicIcon size={16} color={colors.textDim} />
                  ) : (
                    <MicOffIcon size={16} color={colors.danger} />
                  )}
                  {item.videoEnabled ? (
                    <VideoIcon size={16} color={colors.textDim} />
                  ) : (
                    <VideoOffIcon size={16} color={colors.textFaint} />
                  )}

                  {isModerator && !isSelf && (
                    <TouchableOpacity onPress={() => setMenuFor(item)} accessibilityLabel={`Options for ${item.displayName}`}>
                      <MoreIcon size={18} color={colors.textDim} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />

          {isModerator && (
            <TouchableOpacity
              style={styles.footerButton}
              onPress={() => void act('Everyone muted', () => client.muteAll(true))}
            >
              <Text style={styles.footerButtonText}>Mute everyone</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>

      {/* --------------------------------------------- per-participant menu */}
      <Modal visible={menuFor !== null} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)}>
          <Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}>
            {menuFor && (
              <>
                <Text style={styles.menuTitle}>{menuFor.displayName}</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => void act(`Muted ${menuFor.displayName}`, () => client.muteParticipant(menuFor.id))}
                >
                  <Text style={styles.menuItemText}>Mute</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => void act('Video stopped', () => client.stopParticipantVideo(menuFor.id))}
                >
                  <Text style={styles.menuItemText}>Stop video</Text>
                </TouchableOpacity>
                {menuFor.screenSharing && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => void act('Share stopped', () => client.stopParticipantShare(menuFor.id))}
                  >
                    <Text style={styles.menuItemText}>Stop screen share</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() =>
                    void act(
                      'Role updated',
                      () => client.setPeerRole(menuFor.id, menuFor.role === 'co-host' ? 'participant' : 'co-host'),
                    )
                  }
                >
                  <Text style={styles.menuItemText}>
                    {menuFor.role === 'co-host' ? 'Remove co-host' : 'Make co-host'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() =>
                    Alert.alert('Remove participant', `Remove ${menuFor.displayName} from the meeting?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => void act('Removed', () => client.removeParticipant(menuFor.id)),
                      },
                    ])
                  }
                >
                  <Text style={[styles.menuItemText, { color: colors.danger }]}>Remove from meeting</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function Avatar({ id, name, level = 0 }: { id: string; name: string; level?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: colorForPeer(id),
          borderWidth: level > 0.08 ? 2 : 0,
          borderColor: colors.success,
        },
      ]}
    >
      <Text style={styles.avatarText}>{initialsFor(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  lobbySection: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 14.5, flexShrink: 1 },
  role: { color: colors.textFaint, fontSize: 11.5 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surface3,
  },
  smallButtonText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  smallButtonPrimary: { backgroundColor: colors.accent },
  smallButtonPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  footerButton: {
    margin: spacing.md,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonText: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  menu: {
    margin: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface3,
    padding: spacing.sm,
    alignSelf: 'center',
    minWidth: 260,
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  menuTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    padding: spacing.md,
  },
  menuItem: { paddingVertical: 13, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  menuItemText: { color: colors.text, fontSize: 15 },
});
