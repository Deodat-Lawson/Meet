import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { colorForPeer, initialsFor } from '@meet/protocol';
import type { Spotlight } from '../spotlight';
import { absoluteFill, colors } from '../theme';
import { iosPipOptions } from '../native/iosPictureInPicture';
import { useRoomStore } from '../store/roomStore';
import { releaseVideo, retainVideo } from '../videoVisibility';

interface SpotlightVideoProps {
  spotlight: Spotlight;
  /** Diameter of the fallback avatar; also sizes its lettering. */
  avatarSize?: number;
  /** Hands this view to iOS Picture-in-Picture; see `iosPipOptions`. */
  iosPictureInPicture?: boolean;
  onVideoSize?: (width: number, height: number) => void;
}

/**
 * The single video a small window shows: the spotlight stream if there is one,
 * the speaker's initials if their camera is off.
 *
 * Shares the consumer bookkeeping with `VideoTile` so a person visible in both
 * the grid and the floating window is counted once and never paused between the
 * two.
 */
export function SpotlightVideo({
  spotlight,
  avatarSize = 44,
  iosPictureInPicture = false,
  onVideoSize,
}: SpotlightVideoProps) {
  const client = useRoomStore((state) => state.client);
  const { peer, stream, source, isLocal } = spotlight;

  useEffect(() => {
    if (isLocal || !client) return;
    retainVideo(client, peer.id, source);
    return () => releaseVideo(client, peer.id, source);
  }, [client, peer.id, source, isLocal]);

  const streamUrl = useMemo(() => (stream ? stream.toURL() : undefined), [stream]);
  const showVideo = Boolean(streamUrl) && (source === 'screen' || isLocal || peer.videoEnabled);

  if (!showVideo || !streamUrl) {
    return (
      <View style={styles.fallback}>
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
    );
  }

  return (
    <RTCView
      streamURL={streamUrl}
      style={StyleSheet.absoluteFill}
      objectFit={source === 'screen' ? 'contain' : 'cover'}
      mirror={isLocal && source === 'webcam'}
      zOrder={source === 'screen' ? 0 : 1}
      iosPIP={iosPictureInPicture ? iosPipOptions(source, isLocal) : undefined}
      onDimensionsChange={
        onVideoSize ? (event) => onVideoSize(event.nativeEvent.width, event.nativeEvent.height) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '600' },
});
