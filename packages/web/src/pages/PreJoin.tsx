import { useEffect, useRef, useState } from 'react';
import type { DeviceOption } from '@meet/client-core';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import { useRoomStore } from '../store/roomStore';
import { CopyIcon, CheckIcon, LockIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../components/icons';

interface PreJoinProps {
  roomId: string;
  onCancel: () => void;
}

/**
 * Device check before entering the meeting.
 *
 * Getting a preview stream here does double duty: the user can see themselves,
 * and the permission prompt (plus the device labels it unlocks) happens before
 * they are on camera in front of other people.
 */
export function PreJoin({ roomId, onCancel }: PreJoinProps) {
  const join = useRoomStore((s) => s.join);
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('meet.displayName') ?? '');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [micId, setMicId] = useState<string>('');
  const [cameraId, setCameraId] = useState<string>('');
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* Look up the room so we know whether to ask for a passcode. */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
      .then((response) => response.json())
      .then((data: { hasPasscode: boolean; name?: string }) => {
        if (cancelled) return;
        setNeedsPasscode(data.hasPasscode);
        setRoomName(data.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  /* Open (or re-open) the preview whenever the selected devices change. */
  useEffect(() => {
    let cancelled = false;

    const open = async () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!cancelled) setPreviewStream(null);

      if (!cameraEnabled && !micEnabled) return;

      try {
        const stream = await webMediaAdapter.getUserMedia({
          video: cameraEnabled ? (cameraId ? { deviceId: { exact: cameraId } } : { width: { ideal: 1280 }, height: { ideal: 720 } }) : false,
          audio: micEnabled ? (micId ? { deviceId: { exact: micId } } : true) : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setPreviewStream(stream);
        setPermissionError(null);
        // Labels only become readable after permission is granted.
        setDevices(await webMediaAdapter.enumerateDevices());
      } catch (error) {
        if (!cancelled) setPermissionError(error instanceof Error ? error.message : 'Could not access your devices.');
      }
    };

    void open();
    return () => {
      cancelled = true;
    };
  }, [cameraEnabled, micEnabled, cameraId, micId]);

  /* Release the preview when leaving this screen. */
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = previewStream;
  }, [previewStream]);

  useEffect(() => {
    void webMediaAdapter.enumerateDevices().then(setDevices).catch(() => undefined);
  }, []);

  const handleJoin = async () => {
    const name = displayName.trim();
    if (!name) {
      setJoinError('Please enter your name.');
      return;
    }
    setJoining(true);
    setJoinError(null);
    localStorage.setItem('meet.displayName', name);

    try {
      // Exchange the passcode for a token before opening the socket.
      const tokenResponse = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name, passcode: passcode || undefined }),
      });

      if (!tokenResponse.ok) {
        const body = (await tokenResponse.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Could not join this meeting.');
      }

      const { token } = (await tokenResponse.json()) as { token: string };

      // Free the preview devices so the meeting can claim them cleanly.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPreviewStream(null);

      await join({
        roomId,
        displayName: name,
        token,
        micEnabled,
        cameraEnabled,
        micDeviceId: micId || undefined,
        cameraDeviceId: cameraId || undefined,
      });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join this meeting.');
      setJoining(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the link is visible on screen anyway */
    }
  };

  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cameras = devices.filter((d) => d.kind === 'videoinput');

  return (
    <div className="center-page">
      <div className="prejoin">
        <div className="preview">
          {cameraEnabled && previewStream ? (
            <video ref={videoRef} autoPlay playsInline muted />
          ) : (
            <div className="preview-placeholder">
              <VideoOffIcon size={30} />
              {permissionError ? 'Camera unavailable' : 'Camera is off'}
            </div>
          )}

          <div className="preview-controls">
            <button
              className={`btn${micEnabled ? '' : ' btn-danger'}`}
              onClick={() => setMicEnabled((on) => !on)}
              aria-pressed={micEnabled}
              title={micEnabled ? 'Turn off microphone' : 'Turn on microphone'}
            >
              {micEnabled ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
            </button>
            <button
              className={`btn${cameraEnabled ? '' : ' btn-danger'}`}
              onClick={() => setCameraEnabled((on) => !on)}
              aria-pressed={cameraEnabled}
              title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {cameraEnabled ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
            </button>
          </div>
        </div>

        <div className="card" style={{ width: '100%' }}>
          <h1>Ready to join?</h1>
          <p className="subtitle">{roomName ?? `Meeting ${roomId}`}</p>

          <div className="field">
            <label htmlFor="display-name">Your name</label>
            <input
              id="display-name"
              className="input"
              placeholder="Alex Rivera"
              value={displayName}
              maxLength={64}
              autoFocus
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void handleJoin()}
            />
          </div>

          {needsPasscode && (
            <div className="field">
              <label htmlFor="passcode">
                <LockIcon size={12} /> Meeting passcode
              </label>
              <input
                id="passcode"
                className="input"
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void handleJoin()}
              />
            </div>
          )}

          {mics.length > 1 && (
            <div className="field">
              <label htmlFor="prejoin-mic">Microphone</label>
              <select id="prejoin-mic" className="select" value={micId} onChange={(event) => setMicId(event.target.value)}>
                <option value="">System default</option>
                {mics.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {cameras.length > 1 && (
            <div className="field">
              <label htmlFor="prejoin-cam">Camera</label>
              <select id="prejoin-cam" className="select" value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
                <option value="">System default</option>
                {cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className="btn btn-primary btn-block" onClick={() => void handleJoin()} disabled={joining} style={{ marginTop: 6 }}>
            {joining ? <span className="spinner" /> : 'Join now'}
          </button>

          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onCancel}>
            Cancel
          </button>

          {permissionError && <p className="error-text">{permissionError}</p>}
          {joinError && <p className="error-text">{joinError}</p>}

          <div className="copy-row" style={{ marginTop: 16 }}>
            <code>{`${location.host}/room/${roomId}`}</code>
            <button className="btn btn-sm" onClick={() => void copyLink()}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
