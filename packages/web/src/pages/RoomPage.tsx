import { useEffect, useState } from 'react';
import { formatDuration } from '@meet/protocol';
import { useRoomStore } from '../store/roomStore';
import { useT } from '../i18n';
import { Stage } from '../components/Stage';
import { ControlBar } from '../components/ControlBar';
import { ParticipantsPanel } from '../components/ParticipantsPanel';
import { ChatPanel } from '../components/ChatPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { AudioRenderer } from '../components/AudioRenderer';
import { LanguageToggle } from '../components/LanguageToggle';
import { CheckIcon, CopyIcon, LockIcon } from '../components/icons';

export function RoomPage({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const { client, room, panel, reactions, leave } = useRoomStore();
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, []);

  /* Warn before an accidental tab close mid-meeting. */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  if (!client || !room) return null;

  if (room.inLobby) {
    return (
      <div className="center-page">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-topbar" style={{ justifyContent: 'flex-end' }}>
            <LanguageToggle />
          </div>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h1>{t('room.waitingTitle')}</h1>
          <p className="subtitle">{t('room.waitingText')}</p>
          <button
            className="btn btn-ghost btn-block"
            onClick={() => {
              leave();
              onLeave();
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard permission denied */
    }
  };

  const consumers = [...room.consumers.values()];
  const reconnecting = room.connection === 'reconnecting' || room.connection === 'connecting';

  return (
    <div className="room">
      <header className="room-header">
        <span className="room-title">{room.room?.name ?? t('room.meeting', { id: roomId })}</span>
        <span className="room-meta">{formatDuration(elapsed)}</span>

        {room.room?.locked && (
          <span className="badge" title={t('room.lockedTitle')}>
            <LockIcon size={12} /> {t('room.locked')}
          </span>
        )}
        {room.room?.recording && (
          <span className="badge badge-rec">
            <span className="dot" /> {t('room.recording')}
          </span>
        )}
        {reconnecting && (
          <span className="badge" style={{ color: 'var(--warn)' }}>
            {t('room.reconnecting')}
          </span>
        )}

        <span className="spacer" />

        <LanguageToggle compact />

        <button
          className="btn btn-sm"
          onClick={() => void copyLink()}
          title={t('room.copyLinkTitle')}
          aria-label={t('room.copyLinkTitle')}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied ? t('common.copied') : t('room.copyLink')}
        </button>
      </header>

      <div className="room-body">
        <main className="stage">
          <Stage client={client} room={room} />

          <div className="reaction-layer">
            {reactions.map((reaction, index) => (
              <div
                key={reaction.key}
                className="floating-reaction"
                // Spread reactions horizontally so simultaneous ones do not overlap.
                style={{ left: `${8 + ((index * 17 + reaction.peerId.charCodeAt(0)) % 80)}%` }}
              >
                {reaction.emoji}
                <span>{reaction.displayName}</span>
              </div>
            ))}
          </div>
        </main>

        {panel === 'participants' && <ParticipantsPanel client={client} room={room} />}
        {panel === 'chat' && <ChatPanel client={client} room={room} />}
        {panel === 'settings' && <SettingsPanel client={client} room={room} />}
      </div>

      <ControlBar
        client={client}
        room={room}
        onLeave={() => {
          leave();
          onLeave();
        }}
      />

      <AudioRenderer consumers={consumers} outputDeviceId={room.local.selectedSpeakerId} />
    </div>
  );
}
