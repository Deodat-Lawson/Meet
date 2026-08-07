import type { RoomClient, RoomState } from '@meet/client-core';
import type { PeerInfo } from '@meet/protocol';
import { isSpotlightMuted, pickSpotlight } from '../src/spotlight';

const peer = (id: string, name = id): PeerInfo =>
  ({
    id,
    displayName: name,
    role: 'participant',
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
    handRaised: false,
  }) as PeerInfo;

function roomWith(options: {
  self?: PeerInfo;
  peers?: PeerInfo[];
  activeSpeakerId?: string | null;
}): RoomState {
  return {
    self: options.self,
    peers: new Map((options.peers ?? []).map((entry) => [entry.id, entry])),
    activeSpeakerId: options.activeSpeakerId ?? null,
  } as unknown as RoomState;
}

function clientWith(sharingPeerId: string | null): RoomClient {
  return {
    screenSharingPeerId: sharingPeerId,
    getStream: (peerId: string, source: string) => ({ toURL: () => `remote://${peerId}/${source}` }),
    getLocalStream: (source: string) => ({ toURL: () => `local://${source}` }),
  } as unknown as RoomClient;
}

describe('pickSpotlight', () => {
  it('shows a shared screen ahead of anyone talking over it', () => {
    const spotlight = pickSpotlight(
      clientWith('bob'),
      roomWith({ self: peer('me'), peers: [peer('bob'), peer('carol')], activeSpeakerId: 'carol' }),
    );

    expect(spotlight).toMatchObject({ source: 'screen', isLocal: false });
    expect(spotlight?.peer.id).toBe('bob');
  });

  it('shows our own screen share when we are the one sharing', () => {
    const spotlight = pickSpotlight(clientWith('me'), roomWith({ self: peer('me'), peers: [peer('bob')] }));

    expect(spotlight).toMatchObject({ source: 'screen', isLocal: true });
    expect(spotlight?.peer.id).toBe('me');
  });

  it('follows the active speaker', () => {
    const spotlight = pickSpotlight(
      clientWith(null),
      roomWith({ self: peer('me'), peers: [peer('bob'), peer('carol')], activeSpeakerId: 'carol' }),
    );

    expect(spotlight?.peer.id).toBe('carol');
    expect(spotlight?.isLocal).toBe(false);
  });

  it('never spends the window on our own face while someone else is there', () => {
    const spotlight = pickSpotlight(
      clientWith(null),
      roomWith({ self: peer('me'), peers: [peer('bob')], activeSpeakerId: 'me' }),
    );

    expect(spotlight?.peer.id).toBe('bob');
  });

  it('falls back to us when the room is otherwise empty', () => {
    const spotlight = pickSpotlight(clientWith(null), roomWith({ self: peer('me'), peers: [] }));

    expect(spotlight).toMatchObject({ isLocal: true, source: 'webcam' });
    expect(spotlight?.peer.id).toBe('me');
  });

  it('has nothing to show before we have joined', () => {
    expect(pickSpotlight(clientWith(null), roomWith({}))).toBeNull();
  });
});

describe('isSpotlightMuted', () => {
  const local = (micEnabled: boolean, micMuted: boolean): RoomState =>
    ({ local: { micEnabled, micMuted } }) as unknown as RoomState;

  it('takes the server at its word about other people', () => {
    const spotlight = pickSpotlight(clientWith(null), roomWith({ self: peer('me'), peers: [peer('bob')] }));
    const room = { ...local(true, false), peers: new Map() } as unknown as RoomState;

    expect(isSpotlightMuted({ ...spotlight!, peer: { ...peer('bob'), audioEnabled: false } }, room)).toBe(true);
    expect(isSpotlightMuted({ ...spotlight!, peer: peer('bob') }, room)).toBe(false);
  });

  it('trusts what we just did to our own microphone, not the round trip', () => {
    const self = { peer: peer('me'), source: 'webcam' as const, isLocal: true };

    // The peer record still says the microphone is live, because the server has
    // not told us otherwise yet. It is our own mute; we do not need telling.
    expect(isSpotlightMuted(self, local(true, true))).toBe(true);
    expect(isSpotlightMuted(self, local(false, false))).toBe(true);
    expect(isSpotlightMuted(self, local(true, false))).toBe(false);
  });
});
