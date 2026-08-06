import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, PixelRatio } from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import { colorForPeer, initialsFor, type PeerInfo, type ProducerSource } from '@meet/protocol';
import { absoluteFill, colors, radius } from '../theme';
import { HandIcon, MicOffIcon, ScreenShareIcon } from './Icons';
import { useT } from '../i18n';
import { useRoomStore } from '../store/roomStore';

interface VideoTileProps {
  peer: PeerInfo;
  stream?: MediaStream;
  source: ProducerSource;
  isLocal?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number;
  compact?: boolean;
  /** Screen shares must never be cropped. */
  contain?: boolean;
}

export function VideoTile({
  peer,
  stream,
  source,
  isLocal = false,
  isSpeaking = false,
  audioLevel = 0,
  compact = false,
  contain = false,
}: VideoTileProps) {
  const t = useT();
  const setRenderSize = useRoomStore((s) => s.setRenderSize);
  const client = useRoomStore((s) => s.client);

  const showVideo = Boolean(stream) && (source === 'screen' || isLocal || peer.videoEnabled);
  const streamUrl = useMemo(() => (stream ? stream.toURL() : undefined), [stream]);

  /* Resume the consumer while this tile is mounted, pause it when it unmounts. */
  useEffect(() => {
    if (isLocal || !client) return;
    void client.setConsumerVisible(peer.id, source, true);
    return () => {
      void client.setConsumerVisible(peer.id, source, false);
    };
  }, [client, peer.id, source, isLocal]);

  const onLayout = (event: LayoutChangeEvent) => {
    if (isLocal) return;
    const width = event.nativeEvent.layout.width;
    if (width > 0) setRenderSize(peer.id, source, Math.round(PixelRatio.getPixelSizeForLayoutSize(width)));
  };

  const avatarSize = compact ? 34 : 72;

  return (
    <View
      style={[styles.tile, compact && styles.tileCompact, isSpeaking && styles.speaking]}
      onLayout={onLayout}
    >
      {showVideo && streamUrl ? (
        <RTCView
          streamURL={streamUrl}
          style={StyleSheet.absoluteFill}
          objectFit={contain ? 'contain' : 'cover'}
          // Only the local camera is mirrored; a shared screen never is.
          mirror={isLocal && source === 'webcam'}
          zOrder={source === 'screen' ? 0 : 1}
        />
      ) : (
        <View style={styles.avatarWrap}>
          <View
            style={[
              styles.avatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: colorForPeer(peer.id),
              },
            ]}
          >
            <Text style={[styles.avatarText, { fontSize: avatarSize / 2.6 }]}>{initialsFor(peer.displayName)}</Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.nameChip}>
          {!peer.audioEnabled ? (
            <MicOffIcon size={12} color={colors.danger} />
          ) : (
            <View
              style={[
                styles.levelDot,
                { transform: [{ scale: 0.6 + Math.min(1, audioLevel) * 0.8 }] },
              ]}
            />
          )}
          <Text style={styles.nameText} numberOfLines={1}>
            {isLocal ? t('tile.self', { name: peer.displayName }) : peer.displayName}
            {source === 'screen' ? t('tile.screenSuffix') : ''}
          </Text>
        </View>
      </View>

      <View style={styles.badges}>
        {peer.handRaised && (
          <View style={styles.pip}>
            <HandIcon size={13} color="#ffd166" />
          </View>
        )}
        {peer.screenSharing && source !== 'screen' && (
          <View style={styles.pip}>
            <ScreenShareIcon size={13} color={colors.accent} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    // No minimum: rows are flex:1, and a floor taller than the available slice
    // pushes the bottom row off screen once enough people are in the meeting.
    minHeight: 0,
  },
  tileCompact: {
    minHeight: 0,
  },
  speaking: {
    borderColor: colors.accent,
  },
  avatarWrap: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
  },
  nameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  nameText: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  badges: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    gap: 4,
  },
  pip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
