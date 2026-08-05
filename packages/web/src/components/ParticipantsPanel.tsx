import { useState } from 'react';
import { colorForPeer, initialsFor, type PeerInfo } from '@meet/protocol';
import type { RoomClient, RoomState } from '@meet/client-core';
import { useRoomStore } from '../store/roomStore';
import { CloseIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, ScreenShareIcon, VideoIcon, VideoOffIcon } from './icons';

export function ParticipantsPanel({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const self = room.self;
  const isModerator = self?.role === 'host' || self?.role === 'co-host';
  const peers = [...room.peers.values()].sort((a, b) => {
    // Raised hands float to the top, then hosts, then join order.
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    if (a.role !== b.role) return a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0;
    return a.joinedAt - b.joinedAt;
  });

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
    <aside className="panel">
      <div className="panel-header">
        Participants ({peers.length + (self ? 1 : 0)})
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label="Close participants">
          <CloseIcon />
        </button>
      </div>

      <div className="panel-body">
        {room.lobbyPeers.length > 0 && isModerator && (
          <>
            <div className="section-label">Waiting to join ({room.lobbyPeers.length})</div>
            {room.lobbyPeers.map((peer) => (
              <div className="participant" key={peer.id}>
                <Avatar name={peer.displayName} id={peer.id} />
                <span className="participant-name">{peer.displayName}</span>
                <button className="btn btn-sm btn-primary" onClick={() => void act('Admitted', () => client.admitLobbyPeer(peer.id, true))}>
                  Admit
                </button>
                <button className="btn btn-sm" onClick={() => void act('Denied', () => client.admitLobbyPeer(peer.id, false))}>
                  Deny
                </button>
              </div>
            ))}
            <div className="section-label">In the meeting</div>
          </>
        )}

        {self && <ParticipantRow peer={self} isSelf audioLevel={room.audioLevels.get(self.id) ?? 0} />}

        {peers.map((peer) => (
          <ParticipantRow
            key={peer.id}
            peer={peer}
            audioLevel={room.audioLevels.get(peer.id) ?? 0}
            menuOpen={menuFor === peer.id}
            onToggleMenu={() => setMenuFor(menuFor === peer.id ? null : peer.id)}
            actions={
              isModerator
                ? {
                    mute: () => void act(`Muted ${peer.displayName}`, () => client.muteParticipant(peer.id)),
                    stopVideo: () => void act(`Stopped ${peer.displayName}'s video`, () => client.stopParticipantVideo(peer.id)),
                    stopShare: () => void act(`Stopped ${peer.displayName}'s share`, () => client.stopParticipantShare(peer.id)),
                    makeCoHost: () =>
                      void act(
                        `${peer.displayName} is now a co-host`,
                        () => client.setPeerRole(peer.id, peer.role === 'co-host' ? 'participant' : 'co-host'),
                      ),
                    makeHost:
                      self?.role === 'host'
                        ? () => {
                            if (confirm(`Make ${peer.displayName} the host? You will become a co-host.`)) {
                              void act(`${peer.displayName} is now the host`, () => client.setPeerRole(peer.id, 'host'));
                            }
                          }
                        : undefined,
                    remove: () => {
                      if (confirm(`Remove ${peer.displayName} from the meeting?`)) {
                        void act(`Removed ${peer.displayName}`, () => client.removeParticipant(peer.id));
                      }
                    },
                  }
                : undefined
            }
          />
        ))}
      </div>

      {isModerator && (
        <div className="panel-footer" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-block" onClick={() => void act('Everyone muted', () => client.muteAll(true))}>
            Mute all
          </button>
          <button
            className="btn btn-sm btn-block"
            onClick={() => void act('Unmute allowed', () => client.setRoomSettings({ allowUnmute: true }))}
          >
            Allow unmute
          </button>
        </div>
      )}
    </aside>
  );
}

interface RowActions {
  mute: () => void;
  stopVideo: () => void;
  stopShare: () => void;
  makeCoHost: () => void;
  makeHost?: () => void;
  remove: () => void;
}

function ParticipantRow({
  peer,
  isSelf = false,
  audioLevel,
  actions,
  menuOpen,
  onToggleMenu,
}: {
  peer: PeerInfo;
  isSelf?: boolean;
  audioLevel: number;
  actions?: RowActions;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
}) {
  return (
    <div className="participant" style={{ position: 'relative' }}>
      <Avatar name={peer.displayName} id={peer.id} level={audioLevel} />
      <span className="participant-name">
        {peer.displayName}
        {isSelf && ' (you)'}
        {peer.role !== 'participant' && <span className="participant-role"> · {peer.role === 'host' ? 'Host' : 'Co-host'}</span>}
      </span>

      {peer.handRaised && (
        <span style={{ color: '#ffd166' }} title="Hand raised">
          <HandIcon size={15} />
        </span>
      )}
      {peer.screenSharing && (
        <span style={{ color: 'var(--accent)' }} title="Sharing screen">
          <ScreenShareIcon size={15} />
        </span>
      )}
      <span style={{ color: peer.audioEnabled ? 'var(--text-dim)' : 'var(--danger)' }}>
        {peer.audioEnabled ? <MicIcon size={15} /> : <MicOffIcon size={15} />}
      </span>
      <span style={{ color: peer.videoEnabled ? 'var(--text-dim)' : 'var(--text-faint)' }}>
        {peer.videoEnabled ? <VideoIcon size={15} /> : <VideoOffIcon size={15} />}
      </span>

      {actions && (
        <div className={`participant-actions${menuOpen ? ' open' : ''}`}>
          <button className="icon-btn" onClick={onToggleMenu} aria-label={`Options for ${peer.displayName}`}>
            <MoreIcon size={16} />
          </button>
        </div>
      )}

      {actions && menuOpen && (
        <div className="popover" style={{ right: 4, bottom: 'auto', top: '100%', marginTop: 4, minWidth: 200 }}>
          <button className="popover-item" onClick={actions.mute}>
            <MicOffIcon size={16} /> Mute
          </button>
          <button className="popover-item" onClick={actions.stopVideo}>
            <VideoOffIcon size={16} /> Stop video
          </button>
          {peer.screenSharing && (
            <button className="popover-item" onClick={actions.stopShare}>
              <ScreenShareIcon size={16} /> Stop screen share
            </button>
          )}
          <button className="popover-item" onClick={actions.makeCoHost}>
            {peer.role === 'co-host' ? 'Remove co-host' : 'Make co-host'}
          </button>
          {actions.makeHost && (
            <button className="popover-item" onClick={actions.makeHost}>
              Make host
            </button>
          )}
          <button className="popover-item danger" onClick={actions.remove}>
            Remove from meeting
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, id, level = 0 }: { name: string; id: string; level?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: 32,
        height: 32,
        fontSize: 12,
        background: colorForPeer(id),
        boxShadow: level > 0.08 ? `0 0 0 ${1 + level * 3}px rgb(34 197 94 / 45%)` : undefined,
        transition: 'box-shadow 90ms linear',
        flexShrink: 0,
      }}
    >
      {initialsFor(name)}
    </div>
  );
}
