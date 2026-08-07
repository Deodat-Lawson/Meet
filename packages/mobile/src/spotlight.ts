import type { RoomClient, RoomState } from '@meet/client-core';
import type { MediaStream } from 'react-native-webrtc';
import type { PeerInfo, ProducerSource } from '@meet/protocol';

export interface Spotlight {
  peer: PeerInfo;
  stream?: MediaStream;
  source: ProducerSource;
  isLocal: boolean;
}

/**
 * Picks the one thing a small window should show.
 *
 * A window the size of a business card cannot hold a grid, so it has to choose,
 * and the order matters more than it looks:
 *
 *  1. a screen share, because that is what a meeting is *about* while one is
 *     running, and it is the thing you leave the app to read alongside;
 *  2. whoever is speaking, as long as it is not you — a floating window of your
 *     own face tells you nothing you did not already know;
 *  3. anyone else, so the window is never empty while other people are present;
 *  4. failing all that, you, alone in the room.
 *
 * Preferring a remote track also happens to be what iOS Picture-in-Picture
 * needs: the local camera stops when the app leaves the foreground, so a
 * self-view would freeze the moment the window became useful.
 */
/**
 * Whether the spotlight's microphone is off.
 *
 * For anyone else this is what the server says about them. For ourselves it is
 * what we did a moment ago: muting pauses the outgoing track, and waiting for
 * that to travel to the server and back would leave the small window claiming
 * we were still talking. Our own microphone is the one fact we do not need to
 * be told.
 */
export function isSpotlightMuted(spotlight: Spotlight, room: RoomState): boolean {
  if (!spotlight.isLocal) return !spotlight.peer.audioEnabled;
  return !room.local.micEnabled || room.local.micMuted;
}

export function pickSpotlight(client: RoomClient, room: RoomState): Spotlight | null {
  const self = room.self;
  const remotePeers = [...room.peers.values()];

  const sharingPeerId = client.screenSharingPeerId;
  if (sharingPeerId) {
    const isLocal = sharingPeerId === self?.id;
    const peer = isLocal ? self : remotePeers.find((candidate) => candidate.id === sharingPeerId);
    if (peer) {
      const stream = isLocal ? client.getLocalStream('screen') : client.getStream(sharingPeerId, 'screen');
      return { peer, stream: stream as unknown as MediaStream | undefined, source: 'screen', isLocal };
    }
  }

  const speaking =
    room.activeSpeakerId && room.activeSpeakerId !== self?.id
      ? remotePeers.find((candidate) => candidate.id === room.activeSpeakerId)
      : undefined;
  const peer = speaking ?? remotePeers[0];
  if (peer) {
    const stream = client.getStream(peer.id, 'webcam') as unknown as MediaStream | undefined;
    return { peer, stream, source: 'webcam', isLocal: false };
  }

  if (!self) return null;
  return {
    peer: self,
    stream: client.getLocalStream('webcam') as unknown as MediaStream | undefined,
    source: 'webcam',
    isLocal: true,
  };
}
