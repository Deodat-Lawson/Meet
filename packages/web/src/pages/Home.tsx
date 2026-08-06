import { useState } from 'react';
import { normalizeRoomId } from '@meet/protocol';
import { VideoIcon } from '../components/icons';
import { LanguageToggle } from '../components/LanguageToggle';
import { useT, useTranslatable, type TranslatableText } from '../i18n';

export function Home({ onNavigate }: { onNavigate: (path: string) => void }) {
  const t = useT();
  const text = useTranslatable();
  const [joinCode, setJoinCode] = useState('');
  const [meetingName, setMeetingName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<TranslatableText | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const createMeeting = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: meetingName.trim() || undefined,
          passcode: passcode.trim() || undefined,
          lobbyEnabled,
        }),
      });
      if (!response.ok) {
        setError({ key: 'home.createFailedRetry' });
        return;
      }
      const { roomId } = (await response.json()) as { roomId: string };
      onNavigate(`/room/${roomId}`);
    } catch {
      setError({ key: 'home.createFailed' });
    } finally {
      setCreating(false);
    }
  };

  const joinMeeting = () => {
    // Accept a full pasted URL as well as a bare code.
    const raw = joinCode.trim();
    const fromUrl = raw.match(/\/room\/([^/?#]+)/)?.[1];
    const id = normalizeRoomId(fromUrl ?? raw);
    if (!id) {
      setError({ key: 'home.enterCode' });
      return;
    }
    onNavigate(`/room/${id}`);
  };

  return (
    <div className="center-page">
      <div className="card">
        <div className="card-topbar">
          <div className="brand">
            <span className="brand-mark">
              <VideoIcon size={18} />
            </span>
            {t('app.name')}
          </div>
          <span className="spacer" />
          <LanguageToggle />
        </div>

        <h1>{t('home.title')}</h1>
        <p className="subtitle">{t('home.subtitle')}</p>

        <button className="btn btn-primary btn-block" onClick={() => void createMeeting()} disabled={creating}>
          {creating ? <span className="spinner" /> : t('home.newMeeting')}
        </button>

        <button
          className="btn btn-block"
          style={{ marginTop: 8, background: 'transparent', color: 'var(--text-dim)', height: 32, fontSize: 13 }}
          onClick={() => setShowOptions((open) => !open)}
        >
          {showOptions ? t('home.hideOptions') : t('home.meetingOptions')}
        </button>

        {showOptions && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
            <div className="field">
              <label htmlFor="meeting-name">{t('home.meetingName')}</label>
              <input
                id="meeting-name"
                className="input"
                placeholder={t('home.meetingNamePlaceholder')}
                value={meetingName}
                maxLength={120}
                onChange={(event) => setMeetingName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="meeting-passcode">{t('home.passcode')}</label>
              <input
                id="meeting-passcode"
                className="input"
                placeholder={t('home.passcodePlaceholder')}
                value={passcode}
                maxLength={32}
                onChange={(event) => setPasscode(event.target.value)}
              />
            </div>
            <button
              className="toggle-row"
              style={{ width: '100%', padding: '4px 0' }}
              onClick={() => setLobbyEnabled(!lobbyEnabled)}
              role="switch"
              aria-checked={lobbyEnabled}
            >
              <span>{t('home.waitingRoom')}</span>
              <span className={`switch${lobbyEnabled ? ' on' : ''}`} />
            </button>
          </div>
        )}

        <div className="divider">{t('common.or')}</div>

        <div className="field">
          <label htmlFor="join-code">{t('home.joinWithCode')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="join-code"
              className="input"
              placeholder={t('home.joinCodePlaceholder')}
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && joinMeeting()}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn" onClick={joinMeeting} disabled={!joinCode.trim()}>
              {t('home.join')}
            </button>
          </div>
        </div>

        {error && <p className="error-text">{text(error)}</p>}

        <p className="hint">{t('home.hint')}</p>
      </div>
    </div>
  );
}
