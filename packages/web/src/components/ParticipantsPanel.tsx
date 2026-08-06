import { useState } from 'react';
import { colorForPeer, initialsFor, type PeerInfo, type Translator } from '@meet/protocol';
import type { RoomClient, RoomState } from '@meet/client-core';
import { useRoomStore, toastFromError, type ToastContent } from '../store/roomStore';
import { useT } from '../i18n';
import { CloseIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, ScreenShareIcon, VideoIcon, VideoOffIcon } from './icons';

export function ParticipantsPanel({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const t = useT();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const self = room.self;
  const isModerator = self?.role === 'host' || self?.role === 'co-host';
  const peers = [...room.peers.values()].sort((a, b) => {
    // Raised hands float to the top, then hosts, then join order.
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    if (a.role !== b.role) return a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0;
    return a.joinedAt - b.joinedAt;
  });

  const act = async (success: ToastContent, action: () => Promise<unknown>) => {
    try {
      await action();
      pushToast(success, 'success');
    } catch (error) {
      pushToast(toastFromError(error, 'common.actionFailed'), 'error');
    } finally {
      setMenuFor(null);
    }
  };

  return (
    <aside className="panel">
      <div className="panel-header">
        {t('participants.title', { count: peers.length + (self ? 1 : 0) })}
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label={t('participants.close')}>
          <CloseIcon />
        </button>
      </div>

      <div className="panel-body">
        {room.lobbyPeers.length > 0 && isModerator && (
          <>
            <div className="section-label">{t('participants.waitingToJoin', { count: room.lobbyPeers.length })}</div>
            {room.lobbyPeers.map((peer) => (
              <div className="participant" key={peer.id}>
                <Avatar name={peer.displayName} id={peer.id} />
                <span className="participant-name">{peer.displayName}</span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void act({ key: 'participants.admitted' }, () => client.admitLobbyPeer(peer.id, true))}
                >
                  {t('participants.admit')}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => void act({ key: 'participants.denied' }, () => client.admitLobbyPeer(peer.id, false))}
                >
                  {t('participants.deny')}
                </button>
              </div>
            ))}
            <div className="section-label">{t('participants.inMeeting')}</div>
          </>
        )}

        {self && <ParticipantRow peer={self} isSelf audioLevel={room.audioLevels.get(self.id) ?? 0} t={t} />}

        {peers.map((peer) => (
          <ParticipantRow
            key={peer.id}
            peer={peer}
            audioLevel={room.audioLevels.get(peer.id) ?? 0}
            menuOpen={menuFor === peer.id}
            onToggleMenu={() => setMenuFor(menuFor === peer.id ? null : peer.id)}
            t={t}
            actions={
              isModerator
                ? {
                    mute: () =>
                      void act({ key: 'participants.muted', params: { name: peer.displayName } }, () =>
                        client.muteParticipant(peer.id),
                      ),
                    stopVideo: () =>
                      void act({ key: 'participants.stoppedVideo', params: { name: peer.displayName } }, () =>
                        client.stopParticipantVideo(peer.id),
                      ),
                    stopShare: () =>
                      void act({ key: 'participants.stoppedShare', params: { name: peer.displayName } }, () =>
                        client.stopParticipantShare(peer.id),
                      ),
                    makeCoHost: () =>
                      void act({ key: 'participants.nowCoHost', params: { name: peer.displayName } }, () =>
                        client.setPeerRole(peer.id, peer.role === 'co-host' ? 'participant' : 'co-host'),
                      ),
                    makeHost:
                      self?.role === 'host'
                        ? () => {
                            if (confirm(t('participants.makeHostConfirm', { name: peer.displayName }))) {
                              void act({ key: 'participants.nowHost', params: { name: peer.displayName } }, () =>
                                client.setPeerRole(peer.id, 'host'),
                              );
                            }
                          }
                        : undefined,
                    remove: () => {
                      if (confirm(t('participants.removeConfirm', { name: peer.displayName }))) {
                        void act({ key: 'participants.removed', params: { name: peer.displayName } }, () =>
                          client.removeParticipant(peer.id),
                        );
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
          <button
            className="btn btn-sm btn-block"
            onClick={() => void act({ key: 'participants.everyoneMuted' }, () => client.muteAll(true))}
          >
            {t('participants.muteAll')}
          </button>
          <button
            className="btn btn-sm btn-block"
            onClick={() =>
              void act({ key: 'participants.unmuteAllowed' }, () => client.setRoomSettings({ allowUnmute: true }))
            }
          >
            {t('participants.allowUnmute')}
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
  t,
}: {
  peer: PeerInfo;
  isSelf?: boolean;
  audioLevel: number;
  actions?: RowActions;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
  t: Translator;
}) {
  return (
    <div className="participant" style={{ position: 'relative' }}>
      <Avatar name={peer.displayName} id={peer.id} level={audioLevel} />
      <span className="participant-name">
        {isSelf ? t('participants.self', { name: peer.displayName }) : peer.displayName}
        {peer.role !== 'participant' && (
          <span className="participant-role"> · {peer.role === 'host' ? t('role.host') : t('role.coHost')}</span>
        )}
      </span>

      {peer.handRaised && (
        <span style={{ color: '#ffd166' }} title={t('participants.handRaised')}>
          <HandIcon size={15} />
        </span>
      )}
      {peer.screenSharing && (
        <span style={{ color: 'var(--accent)' }} title={t('participants.sharingScreen')}>
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
          <button className="icon-btn" onClick={onToggleMenu} aria-label={t('participants.optionsFor', { name: peer.displayName })}>
            <MoreIcon size={16} />
          </button>
        </div>
      )}

      {actions && menuOpen && (
        <div className="popover" style={{ right: 4, bottom: 'auto', top: '100%', marginTop: 4, minWidth: 200 }}>
          <button className="popover-item" onClick={actions.mute}>
            <MicOffIcon size={16} /> {t('participants.mute')}
          </button>
          <button className="popover-item" onClick={actions.stopVideo}>
            <VideoOffIcon size={16} /> {t('participants.stopVideo')}
          </button>
          {peer.screenSharing && (
            <button className="popover-item" onClick={actions.stopShare}>
              <ScreenShareIcon size={16} /> {t('participants.stopShare')}
            </button>
          )}
          <button className="popover-item" onClick={actions.makeCoHost}>
            {peer.role === 'co-host' ? t('participants.removeCoHost') : t('participants.makeCoHost')}
          </button>
          {actions.makeHost && (
            <button className="popover-item" onClick={actions.makeHost}>
              {t('participants.makeHost')}
            </button>
          )}
          <button className="popover-item danger" onClick={actions.remove}>
            {t('participants.remove')}
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
