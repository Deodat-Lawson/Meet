import { useState } from 'react';
import { normalizeRoomId } from '@meet/protocol';
import { VideoIcon } from '../components/icons';

export function Home({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [joinCode, setJoinCode] = useState('');
  const [meetingName, setMeetingName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      if (!response.ok) throw new Error('Could not create the meeting. Please try again.');
      const { roomId } = (await response.json()) as { roomId: string };
      onNavigate(`/room/${roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the meeting.');
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
      setError('Enter a meeting code or link.');
      return;
    }
    onNavigate(`/room/${id}`);
  };

  return (
    <div className="center-page">
      <div className="card">
        <div className="brand">
          <span className="brand-mark">
            <VideoIcon size={18} />
          </span>
          Meet
        </div>

        <h1>Start or join a meeting</h1>
        <p className="subtitle">
          Video, audio and screen sharing that runs in your browser. No download, no account.
        </p>

        <button className="btn btn-primary btn-block" onClick={() => void createMeeting()} disabled={creating}>
          {creating ? <span className="spinner" /> : 'New meeting'}
        </button>

        <button
          className="btn btn-block"
          style={{ marginTop: 8, background: 'transparent', color: 'var(--text-dim)', height: 32, fontSize: 13 }}
          onClick={() => setShowOptions((open) => !open)}
        >
          {showOptions ? 'Hide options' : 'Meeting options'}
        </button>

        {showOptions && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
            <div className="field">
              <label htmlFor="meeting-name">Meeting name</label>
              <input
                id="meeting-name"
                className="input"
                placeholder="Weekly standup"
                value={meetingName}
                maxLength={120}
                onChange={(event) => setMeetingName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="meeting-passcode">Passcode (optional)</label>
              <input
                id="meeting-passcode"
                className="input"
                placeholder="At least 4 characters"
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
              <span>Waiting room</span>
              <span className={`switch${lobbyEnabled ? ' on' : ''}`} />
            </button>
          </div>
        )}

        <div className="divider">or</div>

        <div className="field">
          <label htmlFor="join-code">Join with a code</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="join-code"
              className="input"
              placeholder="abc-defg-hij"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && joinMeeting()}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn" onClick={joinMeeting} disabled={!joinCode.trim()}>
              Join
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <p className="hint">
          Works in Chrome, Edge, Firefox and Safari, and in the Meet Android app. Screen sharing needs a desktop browser
          or the Android app.
        </p>
      </div>
    </div>
  );
}
