import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RoomClient, RoomState } from '@meet/client-core';
import { colors, radius, spacing } from '../theme';
import {
  CameraSwitchIcon,
  ChatIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  RecordIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  SmileIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from './Icons';
import { fromError, useT } from '../i18n';
import { useRoomStore } from '../store/roomStore';

const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🤔', '👋'];

export function ControlBar({
  client,
  room,
  onLeave,
}: {
  client: RoomClient;
  room: RoomState;
  onLeave: () => void;
}) {
  const { panel, setPanel, pushToast, unreadChat, speakerphone, toggleSpeakerphone } = useRoomStore();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const local = room.local;
  const micOn = local.micEnabled && !local.micMuted;
  const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';
  const participantCount = room.peers.size + (room.self ? 1 : 0);
  const someoneElseSharing = Boolean(client.screenSharingPeerId && client.screenSharingPeerId !== room.self?.id);

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      // The "cancelled" check reads the browser/native error verbatim, so it
      // stays language-independent regardless of what gets shown.
      const raw = error instanceof Error ? error.message : '';
      if (!/cancelled/i.test(raw)) pushToast(fromError(error, 'common.somethingWentWrong'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <View style={styles.bar}>
        <Control
          label={micOn ? t('controls.mute') : t('controls.unmute')}
          off={!micOn}
          icon={micOn ? <MicIcon size={21} /> : <MicOffIcon size={21} color="#fff" />}
          onPress={() => run('mic', () => client.toggleMic())}
        />
        <Control
          label={local.cameraEnabled ? t('mobile.stop') : t('mobile.start')}
          off={!local.cameraEnabled}
          icon={local.cameraEnabled ? <VideoIcon size={21} /> : <VideoOffIcon size={21} color="#fff" />}
          onPress={() => run('cam', () => client.toggleCamera())}
        />
        <Control
          label={local.screenSharing ? t('mobile.stop') : t('controls.share')}
          accent={local.screenSharing}
          disabled={someoneElseSharing && !local.screenSharing}
          icon={
            local.screenSharing ? (
              <ScreenShareOffIcon size={21} color="#fff" />
            ) : (
              <ScreenShareIcon size={21} />
            )
          }
          onPress={() =>
            run('share', async () => {
              if (local.screenSharing) return client.stopScreenShare();
              // Android shows a system consent dialog; explain why before it appears.
              return client.startScreenShare(false);
            })
          }
        />
        <Control
          label={t('mobile.people')}
          badge={participantCount}
          active={panel === 'participants'}
          icon={<UsersIcon size={21} />}
          onPress={() => setPanel(panel === 'participants' ? 'none' : 'participants')}
        />
        <Control
          label={t('controls.chat')}
          badge={unreadChat > 0 ? unreadChat : undefined}
          active={panel === 'chat'}
          icon={<ChatIcon size={21} />}
          onPress={() => setPanel(panel === 'chat' ? 'none' : 'chat')}
        />
        <Control label={t('controls.more')} icon={<MoreIcon size={21} />} onPress={() => setMoreOpen(true)} />

        <TouchableOpacity style={styles.leave} onPress={onLeave} accessibilityLabel={t('controls.leaveMeeting')}>
          <PhoneOffIcon size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ------------------------------------------------------ more sheet */}
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <SheetItem
              icon={<CameraSwitchIcon size={20} />}
              label={t('mobile.switchCamera')}
              disabled={!local.cameraEnabled}
              onPress={() => {
                setMoreOpen(false);
                void run('switch', () => client.switchCamera());
              }}
            />
            <SheetItem
              icon={speakerphone ? <SpeakerIcon size={20} /> : <SpeakerOffIcon size={20} />}
              label={speakerphone ? t('mobile.speakerOn') : t('mobile.speakerOff')}
              onPress={() => void toggleSpeakerphone()}
            />
            <SheetItem
              icon={<HandIcon size={20} color={room.self?.handRaised ? colors.accent : colors.text} />}
              label={room.self?.handRaised ? t('controls.lowerHand') : t('controls.raiseHand')}
              onPress={() => {
                setMoreOpen(false);
                void run('hand', () => client.raiseHand(!room.self?.handRaised));
              }}
            />
            <SheetItem
              icon={<SmileIcon size={20} />}
              label={t('mobile.sendAReaction')}
              onPress={() => {
                setMoreOpen(false);
                setReactionsOpen(true);
              }}
            />

            {isModerator && (
              <>
                <Text style={styles.sheetSection}>{t('mobile.hostControls')}</Text>
                <SheetItem
                  icon={<MicOffIcon size={20} />}
                  label={t('controls.muteEveryone')}
                  onPress={() => {
                    setMoreOpen(false);
                    void run('muteAll', () => client.muteAll(true));
                  }}
                />
                <SheetItem
                  icon={<RecordIcon size={20} />}
                  label={room.room?.recording ? t('controls.stopRecording') : t('controls.recordMeeting')}
                  onPress={() => {
                    setMoreOpen(false);
                    void run('record', () => (room.room?.recording ? client.stopRecording() : client.startRecording()));
                  }}
                />
                <SheetItem
                  icon={<PhoneOffIcon size={20} color={colors.danger} />}
                  label={t('controls.endForAll')}
                  danger
                  onPress={() => {
                    setMoreOpen(false);
                    Alert.alert(t('mobile.endMeeting'), t('mobile.endMeetingBody'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('mobile.end'),
                        style: 'destructive',
                        onPress: () => void run('end', () => client.endMeeting()),
                      },
                    ]);
                  }}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ------------------------------------------------- reaction picker */}
      <Modal visible={reactionsOpen} transparent animationType="fade" onRequestClose={() => setReactionsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setReactionsOpen(false)}>
          <View style={styles.reactionBar}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionButton}
                accessibilityLabel={t('controls.sendReaction', { emoji })}
                onPress={() => {
                  void client.sendReaction(emoji);
                  setReactionsOpen(false);
                }}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Control({
  label,
  icon,
  onPress,
  off,
  active,
  accent,
  badge,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  off?: boolean;
  active?: boolean;
  accent?: boolean;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.control, disabled && styles.controlDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconWrap, off && styles.iconWrapOff, accent && styles.iconWrapAccent]}>
        {icon}
        {badge !== undefined && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.controlLabel, active && styles.controlLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SheetItem({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.sheetItem, disabled && styles.controlDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon}
      <Text style={[styles.sheetItemText, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  control: { alignItems: 'center', gap: 3, minWidth: 46 },
  controlDisabled: { opacity: 0.4 },
  controlLabel: { color: colors.textDim, fontSize: 10.5 },
  controlLabelActive: { color: colors.accent },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOff: { backgroundColor: colors.danger },
  iconWrapAccent: { backgroundColor: colors.accent },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  leave: {
    width: 54,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  sheetItemText: { color: colors.text, fontSize: 15 },
  sheetSection: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  reactionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface3,
  },
  reactionButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  reactionEmoji: { fontSize: 28 },
});
