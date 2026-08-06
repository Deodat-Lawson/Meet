import { useEffect, useRef, useState } from 'react';
import type { RoomClient, RoomState } from '@meet/client-core';
import type { Translator } from '@meet/protocol';
import { useRoomStore, toastFromError } from '../store/roomStore';
import { useT } from '../i18n';
import {
  ChatIcon,
  GridIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  RecordIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  SettingsIcon,
  SmileIcon,
  SpeakerViewIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons';

const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🤔', '👋'];

/* Keyboard shortcuts are typography, not prose — the same in every language. */
const MIC_SHORTCUT = '⌘⇧A';
const CAMERA_SHORTCUT = '⌘⇧V';
const SHARE_SHORTCUT = '⌘⇧S';

interface ControlBarProps {
  client: RoomClient;
  room: RoomState;
  onLeave: () => void;
}

export function ControlBar({ client, room, onLeave }: ControlBarProps) {
  const { panel, setPanel, layout, setLayout, pushToast, unreadChat } = useRoomStore();
  const t = useT();
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const local = room.local;
  const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';
  const participantCount = room.peers.size + (room.self ? 1 : 0);
  const someoneElseSharing = Boolean(client.screenSharingPeerId && client.screenSharingPeerId !== room.self?.id);

  /** Wraps an async action so a failure surfaces as a toast instead of a dead button. */
  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      // A cancelled share picker is a normal outcome, not a failure. The check
      // is against the browser's own English message, so it stays language-
      // independent by looking at the raw error rather than the translation.
      const raw = error instanceof Error ? error.message : '';
      if (!/cancelled/i.test(raw)) pushToast(toastFromError(error, 'common.somethingWentWrong'), 'error');
    } finally {
      setBusy(null);
    }
  };

  /* Keyboard shortcuts, matching Zoom's defaults where they exist. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        void run('mic', () => client.toggleMic());
      } else if (mod && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void run('cam', () => client.toggleCamera());
      } else if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void run('share', () => client.toggleScreenShare());
      } else if (event.key === ' ' && !event.repeat && local.micMuted) {
        // Push-to-talk while the space bar is held.
        event.preventDefault();
        void client.unmuteMic();
        const onKeyUp = (e: KeyboardEvent) => {
          if (e.key === ' ') {
            void client.muteMic();
            window.removeEventListener('keyup', onKeyUp);
          }
        };
        window.addEventListener('keyup', onKeyUp);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `run` and `local.micMuted` are read fresh on each event via closure re-creation.
  }, [client, local.micMuted]);

  const micOn = local.micEnabled && !local.micMuted;

  return (
    <div className="controls">
      <button
        className={`control${micOn ? '' : ' off'}`}
        onClick={() => void run('mic', () => client.toggleMic())}
        disabled={busy === 'mic'}
        title={micOn ? t('controls.muteHint', { shortcut: MIC_SHORTCUT }) : t('controls.unmuteHint', { shortcut: MIC_SHORTCUT })}
        aria-pressed={micOn}
      >
        <span className="icon-wrap">{micOn ? <MicIcon /> : <MicOffIcon />}</span>
        {micOn ? t('controls.mute') : t('controls.unmute')}
      </button>

      <button
        className={`control${local.cameraEnabled ? '' : ' off'}`}
        onClick={() => void run('cam', () => client.toggleCamera())}
        disabled={busy === 'cam'}
        title={
          local.cameraEnabled
            ? t('controls.stopVideoHint', { shortcut: CAMERA_SHORTCUT })
            : t('controls.startVideoHint', { shortcut: CAMERA_SHORTCUT })
        }
        aria-pressed={local.cameraEnabled}
      >
        <span className="icon-wrap">{local.cameraEnabled ? <VideoIcon /> : <VideoOffIcon />}</span>
        {local.cameraEnabled ? t('controls.stopVideo') : t('controls.startVideo')}
      </button>

      <button
        className={`control${local.screenSharing ? ' on-accent' : ''}`}
        onClick={() => void run('share', () => client.toggleScreenShare())}
        disabled={busy === 'share' || (someoneElseSharing && !local.screenSharing)}
        title={
          someoneElseSharing && !local.screenSharing
            ? t('controls.someoneElseSharing')
            : local.screenSharing
              ? t('controls.stopShareHint', { shortcut: SHARE_SHORTCUT })
              : t('controls.shareHint', { shortcut: SHARE_SHORTCUT })
        }
        aria-pressed={local.screenSharing}
      >
        <span className="icon-wrap">{local.screenSharing ? <ScreenShareOffIcon /> : <ScreenShareIcon />}</span>
        {local.screenSharing ? t('controls.stopShare') : t('controls.share')}
      </button>

      <button
        className={`control${panel === 'participants' ? ' active' : ''}`}
        onClick={() => setPanel(panel === 'participants' ? 'none' : 'participants')}
        title={t('controls.participants')}
      >
        <span className="icon-wrap">
          <UsersIcon />
          <span className="control-count">{participantCount}</span>
        </span>
        {t('controls.participants')}
      </button>

      <button
        className={`control${panel === 'chat' ? ' active' : ''}`}
        onClick={() => setPanel(panel === 'chat' ? 'none' : 'chat')}
        title={t('controls.chat')}
      >
        <span className="icon-wrap">
          <ChatIcon />
          {unreadChat > 0 && <span className="control-count">{unreadChat > 9 ? '9+' : unreadChat}</span>}
        </span>
        {t('controls.chat')}
      </button>

      <div className="control-wrap">
        <button
          className={`control${reactionsOpen ? ' active' : ''}`}
          onClick={() => {
            setReactionsOpen((open) => !open);
            setMoreOpen(false);
          }}
          title={t('controls.reactions')}
          aria-expanded={reactionsOpen}
        >
          <span className="icon-wrap">
            <SmileIcon />
          </span>
          {t('controls.react')}
        </button>
        {reactionsOpen && (
          <div className="reaction-bar" role="menu">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  void client.sendReaction(emoji);
                  setReactionsOpen(false);
                }}
                title={t('controls.sendReaction', { emoji })}
                aria-label={t('controls.sendReaction', { emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className={`control${room.self?.handRaised ? ' on-accent' : ''}`}
        onClick={() => void run('hand', () => client.raiseHand(!room.self?.handRaised))}
        title={room.self?.handRaised ? t('controls.lowerHand') : t('controls.raiseHand')}
        aria-pressed={Boolean(room.self?.handRaised)}
      >
        <span className="icon-wrap">
          <HandIcon />
        </span>
        {room.self?.handRaised ? t('controls.lower') : t('controls.raise')}
      </button>

      <div className="control-wrap">
        <button
          className={`control${moreOpen ? ' active' : ''}`}
          onClick={() => {
            setMoreOpen((open) => !open);
            setReactionsOpen(false);
          }}
          title={t('controls.moreOptions')}
          aria-expanded={moreOpen}
        >
          <span className="icon-wrap">
            <MoreIcon />
          </span>
          {t('controls.more')}
        </button>
        {moreOpen && (
          <MorePopover
            client={client}
            room={room}
            layout={layout}
            isModerator={isModerator}
            t={t}
            onClose={() => setMoreOpen(false)}
            onLayout={setLayout}
            onSettings={() => {
              setPanel('settings');
              setMoreOpen(false);
            }}
            onAction={run}
          />
        )}
      </div>

      <button className="leave-btn" onClick={onLeave} title={t('controls.leaveMeeting')}>
        <PhoneOffIcon size={17} /> {t('controls.leave')}
      </button>
    </div>
  );
}

function MorePopover({
  client,
  room,
  layout,
  isModerator,
  t,
  onClose,
  onLayout,
  onSettings,
  onAction,
}: {
  client: RoomClient;
  room: RoomState;
  layout: 'gallery' | 'speaker';
  isModerator: boolean;
  t: Translator;
  onClose: () => void;
  onLayout: (layout: 'gallery' | 'speaker') => void;
  onSettings: () => void;
  onAction: (key: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    // Deferred so the click that opened the popover does not immediately close it.
    const timer = setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [onClose]);

  const recording = room.room?.recording ?? false;

  return (
    <div className="popover" ref={ref} style={{ right: 0 }} role="menu">
      <button
        className="popover-item"
        onClick={() => {
          onLayout(layout === 'gallery' ? 'speaker' : 'gallery');
          onClose();
        }}
      >
        {layout === 'gallery' ? <SpeakerViewIcon size={17} /> : <GridIcon size={17} />}
        {layout === 'gallery' ? t('controls.speakerView') : t('controls.galleryView')}
      </button>

      <button className="popover-item" onClick={onSettings}>
        <SettingsIcon size={17} /> {t('controls.avSettings')}
      </button>

      {isModerator && (
        <>
          <button
            className="popover-item"
            onClick={() => {
              void onAction('record', () => (recording ? client.stopRecording() : client.startRecording()));
              onClose();
            }}
          >
            <RecordIcon size={17} /> {recording ? t('controls.stopRecording') : t('controls.recordMeeting')}
          </button>

          <button
            className="popover-item"
            onClick={() => {
              void onAction('muteAll', () => client.muteAll(true));
              onClose();
            }}
          >
            <MicOffIcon size={17} /> {t('controls.muteEveryone')}
          </button>

          <button
            className="popover-item"
            onClick={() => {
              void onAction('lock', () => client.setRoomSettings({ locked: !room.room?.locked }));
              onClose();
            }}
          >
            <UsersIcon size={17} /> {room.room?.locked ? t('controls.unlockMeeting') : t('controls.lockMeeting')}
          </button>

          <button
            className="popover-item danger"
            onClick={() => {
              if (confirm(t('controls.endConfirm'))) void onAction('end', () => client.endMeeting());
              onClose();
            }}
          >
            <PhoneOffIcon size={17} /> {t('controls.endForAll')}
          </button>
        </>
      )}
    </div>
  );
}
