import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type View as ViewType,
} from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import { formatDuration, type PeerInfo, type ProducerSource } from '@meet/protocol';
import { absoluteFill, colors, radius, spacing } from '../theme';
import { VideoTile } from '../components/VideoTile';
import { ControlBar } from '../components/ControlBar';
import { ParticipantsSheet } from '../components/ParticipantsSheet';
import { ChatSheet } from '../components/ChatSheet';
import { LanguageToggle } from '../components/LanguageToggle';
import { MinimizeIcon } from '../components/Icons';
import { useT } from '../i18n';
import { pictureInPicture } from '../native/pictureInPicture';
import { pickSpotlight } from '../spotlight';
import { useRoomStore } from '../store/roomStore';

export function MeetingScreen({
  roomId,
  startedAt,
  onLeave,
  onMinimize,
  onSpotlightVideoSize,
}: {
  roomId: string;
  /** When the call began, so the timer survives being collapsed and restored. */
  startedAt: number;
  onLeave: () => void;
  onMinimize: () => void;
  /** Proportions of the video a small window would show, if it opened now. */
  onSpotlightVideoSize?: (width: number, height: number) => void;
}) {
  const { client, room, panel, reactions, leave } = useRoomStore();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  /**
   * Tells the platform where the video is on screen, so shrinking the meeting
   * into its window is one continuous movement out of the stage rather than a
   * cross-fade between two unrelated pictures.
   */
  const stageRef = useRef<ViewType>(null);
  const reportStageRect = () => {
    stageRef.current?.measureInWindow((x, y, stageWidth, stageHeight) => {
      if (!stageWidth || !stageHeight) return;
      const toPixels = (value: number) => PixelRatio.getPixelSizeForLayoutSize(value);
      pictureInPicture.setSourceRect(toPixels(x), toPixels(y), toPixels(stageWidth), toPixels(stageHeight));
    });
  };

  const self = room?.self;
  const allPeers = useMemo<PeerInfo[]>(() => {
    if (!room) return [];
    const peers = [...room.peers.values()];
    return self ? [self, ...peers] : peers;
  }, [room, self]);

  if (!client || !room) return null;

  if (room.inLobby) {
    return (
      <View style={styles.centered}>
        <LanguageToggle style={styles.lobbyLanguage} />
        <Text style={styles.lobbyTitle}>{t('room.waitingTitle')}</Text>
        <Text style={styles.lobbyText}>{t('room.waitingText')}</Text>
        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() => {
            leave();
            onLeave();
          }}
        >
          <Text style={styles.ghostButtonText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const streamFor = (peer: PeerInfo): MediaStream | undefined => {
    const stream =
      self && peer.id === self.id ? client.getLocalStream('webcam') : client.getStream(peer.id, 'webcam');
    return stream as unknown as MediaStream | undefined;
  };

  const sharingPeerId = client.screenSharingPeerId;
  const sharingPeer = sharingPeerId ? allPeers.find((p) => p.id === sharingPeerId) : undefined;
  const isSharingLocally = Boolean(self && sharingPeerId === self.id);
  const screenStream = sharingPeerId
    ? ((isSharingLocally ? client.getLocalStream('screen') : client.getStream(sharingPeerId, 'screen')) as unknown as
        | MediaStream
        | undefined)
    : undefined;

  const isLandscape = width > height;

  /* The tile a small window would show if one opened now. It reports the shape
     of its video so the window can open at the right proportions, and on iOS —
     which shrinks a video view rather than a screen — it is the view the system
     takes over. Never a local one: the camera stops in the background. */
  const spotlight = pickSpotlight(client, room);
  const isSpotlight = (source: ProducerSource, peerId: string) =>
    Boolean(spotlight && !spotlight.isLocal && spotlight.source === source && spotlight.peer.id === peerId);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.minimize}
          onPress={onMinimize}
          accessibilityRole="button"
          accessibilityLabel={t('mini.minimize')}
        >
          <MinimizeIcon size={19} color={colors.textDim} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {room.room?.name ?? t('room.meeting', { id: roomId })}
        </Text>
        <Text style={styles.headerMeta}>{formatDuration(elapsed)}</Text>
        {room.room?.recording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{t('mobile.rec')}</Text>
          </View>
        )}
        {(room.connection === 'reconnecting' || room.connection === 'connecting') && (
          <Text style={styles.reconnecting}>{t('room.reconnecting')}</Text>
        )}
        <View style={styles.flex} />
        <LanguageToggle compact />
      </View>

      <View style={styles.stage} ref={stageRef} onLayout={reportStageRect} collapsable={false}>
        {sharingPeerId && screenStream && sharingPeer ? (
          <View style={styles.flex}>
            <View style={styles.shareBanner}>
              <Text style={styles.shareBannerText}>
                {isSharingLocally
                  ? t('room.sharingLocal')
                  : t('mobile.sharingShort', { name: sharingPeer.displayName })}
              </Text>
            </View>
            <View style={styles.shareStage}>
              <VideoTile
                peer={sharingPeer}
                stream={screenStream}
                source="screen"
                isLocal={isSharingLocally}
                contain
                iosPictureInPicture={isSpotlight('screen', sharingPeer.id)}
                onVideoSize={isSpotlight('screen', sharingPeer.id) ? onSpotlightVideoSize : undefined}
              />
            </View>
            <ScrollView horizontal style={styles.filmstrip} contentContainerStyle={styles.filmstripContent}>
              {allPeers.map((peer) => (
                <View key={peer.id} style={styles.filmstripTile}>
                  <VideoTile
                    peer={peer}
                    stream={streamFor(peer)}
                    source="webcam"
                    isLocal={Boolean(self && peer.id === self.id)}
                    isSpeaking={room.activeSpeakerId === peer.id}
                    audioLevel={room.audioLevels.get(peer.id) ?? 0}
                    compact
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Grid columns={gridColumns(allPeers.length, isLandscape)}>
            {allPeers.map((peer) => (
              <VideoTile
                key={peer.id}
                peer={peer}
                stream={streamFor(peer)}
                source="webcam"
                isLocal={Boolean(self && peer.id === self.id)}
                isSpeaking={room.activeSpeakerId === peer.id}
                audioLevel={room.audioLevels.get(peer.id) ?? 0}
                iosPictureInPicture={isSpotlight('webcam', peer.id)}
                onVideoSize={isSpotlight('webcam', peer.id) ? onSpotlightVideoSize : undefined}
              />
            ))}
          </Grid>
        )}

        <View pointerEvents="none" style={styles.reactionLayer}>
          {reactions.map((reaction, index) => (
            <View key={reaction.key} style={[styles.reaction, { left: `${10 + ((index * 19) % 70)}%` }]}>
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              <Text style={styles.reactionName}>{reaction.displayName}</Text>
            </View>
          ))}
        </View>
      </View>

      <ControlBar
        client={client}
        room={room}
        onLeave={() => {
          Alert.alert(t('mobile.leaveConfirmTitle'), t('mobile.leaveConfirmBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('controls.leave'),
              style: 'destructive',
              onPress: () => {
                leave();
                onLeave();
              },
            },
          ]);
        }}
      />

      {panel === 'participants' && <ParticipantsSheet client={client} room={room} />}
      {panel === 'chat' && <ChatSheet client={client} room={room} />}
    </View>
  );
}

/** Two columns is the sweet spot on a phone; landscape fits three. */
function gridColumns(count: number, isLandscape: boolean): number {
  if (count <= 1) return 1;
  if (isLandscape) return count <= 2 ? 2 : 3;
  return count <= 2 ? 1 : 2;
}

function Grid({ columns, children }: { columns: number; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View style={styles.grid}>
      {rows.map((row, index) => (
        <View key={index} style={styles.gridRow}>
          {row.map((item, itemIndex) => (
            <View key={itemIndex} style={styles.gridCell}>
              {item}
            </View>
          ))}
          {/* Pad the final row so a lone tile does not stretch full width. */}
          {row.length < columns &&
            Array.from({ length: columns - row.length }, (_, padIndex) => (
              <View key={`pad-${padIndex}`} style={styles.gridCell} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  lobbyLanguage: { alignSelf: 'center', marginBottom: spacing.md },
  lobbyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  lobbyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  ghostButton: {
    marginTop: spacing.lg,
    height: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  minimize: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  headerTitle: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  headerMeta: { color: colors.textFaint, fontSize: 12.5 },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232,80,58,0.18)',
  },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  recText: { color: '#ff9a8a', fontSize: 11, fontWeight: '700' },
  reconnecting: { color: colors.warn, fontSize: 12 },
  stage: { flex: 1, padding: spacing.sm },
  grid: { flex: 1, gap: spacing.sm },
  gridRow: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  gridCell: { flex: 1 },
  shareStage: { flex: 1, backgroundColor: '#000', borderRadius: radius.md, overflow: 'hidden' },
  shareBanner: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginBottom: spacing.sm,
    zIndex: 5,
  },
  shareBannerText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  filmstrip: { maxHeight: 92, marginTop: spacing.sm },
  filmstripContent: { gap: spacing.sm },
  filmstripTile: { width: 130, height: 84 },
  reactionLayer: { ...absoluteFill },
  reaction: { position: 'absolute', bottom: 24, alignItems: 'center' },
  reactionEmoji: { fontSize: 34 },
  reactionName: {
    color: colors.textDim,
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
