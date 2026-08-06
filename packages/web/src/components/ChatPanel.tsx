import { useEffect, useRef, useState } from 'react';
import type { RoomClient, RoomState } from '@meet/client-core';
import { useRoomStore, toastFromError } from '../store/roomStore';
import { useLocaleTag, useT } from '../i18n';
import { ChatIcon, CloseIcon, SendIcon } from './icons';

export function ChatPanel({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const t = useT();
  const localeTag = useLocaleTag();
  const [text, setText] = useState('');
  const [to, setTo] = useState<string>('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Keep the newest message in view, but never yank the view away from someone
     who has scrolled up to read history. */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [room.chat.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await client.sendChatMessage(trimmed, to || undefined);
      setText('');
    } catch (error) {
      pushToast(toastFromError(error, 'chat.notSent'), 'error');
    } finally {
      setSending(false);
    }
  };

  const peers = [...room.peers.values()];

  return (
    <aside className="panel">
      <div className="panel-header">
        {t('chat.title')}
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label={t('chat.close')}>
          <CloseIcon />
        </button>
      </div>

      <div className="panel-body" ref={listRef}>
        {room.chat.length === 0 ? (
          <div className="empty-state">
            <ChatIcon size={26} />
            {t('chat.empty')}
            <span style={{ fontSize: 12 }}>{t('chat.emptyHint')}</span>
          </div>
        ) : (
          <div className="chat-list">
            {room.chat.map((message) => {
              const isSelf = message.peerId === room.self?.id;
              const recipient = message.to
                ? message.to === room.self?.id
                  ? t('chat.youObject')
                  : peers.find((p) => p.id === message.to)?.displayName
                : null;
              return (
                <div key={message.id}>
                  <div className="chat-msg-head">
                    <span className="chat-author" style={{ color: isSelf ? 'var(--accent)' : undefined }}>
                      {isSelf ? t('chat.you') : message.displayName}
                    </span>
                    {recipient && <span className="chat-private">{t('chat.privatelyTo', { name: recipient })}</span>}
                    <span className="chat-time">
                      {new Date(message.timestamp).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="chat-text">{message.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel-footer">
        {peers.length > 0 && (
          <select
            className="select"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label={t('chat.recipient')}
            style={{ marginBottom: 8, height: 34, fontSize: 13 }}
          >
            <option value="">{t('chat.toEveryone')}</option>
            {peers.map((peer) => (
              <option key={peer.id} value={peer.id}>
                {t('chat.toPerson', { name: peer.displayName })}
              </option>
            ))}
          </select>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            value={text}
            maxLength={4000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button className="btn btn-primary" onClick={() => void send()} disabled={!text.trim() || sending} aria-label={t('chat.send')}>
            <SendIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
