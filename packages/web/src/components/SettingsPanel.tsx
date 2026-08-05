import { useEffect, useState } from 'react';
import type { DeviceOption, RoomClient, RoomState } from '@meet/client-core';
import type { VideoQuality } from '@meet/protocol';
import { useRoomStore } from '../store/roomStore';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import { CloseIcon } from './icons';

const QUALITIES: Array<{ value: VideoQuality; label: string }> = [
  { value: 'low', label: 'Low — 320p (saves data)' },
  { value: 'medium', label: 'Medium — 360p' },
  { value: 'high', label: 'High — 720p (recommended)' },
  { value: 'hd1080', label: 'Full HD — 1080p' },
];

export function SettingsPanel({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  useEffect(() => {
    const load = () => void client.listDevices().then(setDevices).catch(() => undefined);
    load();
    // Devices change when a headset is plugged in mid-meeting.
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, [client]);

  const change = async (kind: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string) => {
    try {
      await client.setDevice(kind, deviceId);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not switch device', 'error');
    }
  };

  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');
  const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';

  return (
    <aside className="panel">
      <div className="panel-header">
        Settings
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label="Close settings">
          <CloseIcon />
        </button>
      </div>

      <div className="panel-body">
        <div className="field">
          <label htmlFor="mic-select">Microphone</label>
          <select
            id="mic-select"
            className="select"
            value={room.local.selectedMicId ?? ''}
            onChange={(event) => void change('audioinput', event.target.value)}
          >
            <option value="">System default</option>
            {mics.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cam-select">Camera</label>
          <select
            id="cam-select"
            className="select"
            value={room.local.selectedCameraId ?? ''}
            onChange={(event) => void change('videoinput', event.target.value)}
          >
            <option value="">System default</option>
            {cameras.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        {webMediaAdapter.supportsAudioOutputSelection && speakers.length > 0 && (
          <div className="field">
            <label htmlFor="speaker-select">Speaker</label>
            <select
              id="speaker-select"
              className="select"
              value={room.local.selectedSpeakerId ?? ''}
              onChange={(event) => void change('audiooutput', event.target.value)}
            >
              <option value="">System default</option>
              {speakers.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="quality-select">Video quality</label>
          <select
            id="quality-select"
            className="select"
            value={room.local.videoQuality}
            onChange={(event) => void client.setVideoQuality(event.target.value as VideoQuality)}
          >
            {QUALITIES.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {quality.label}
              </option>
            ))}
          </select>
          <p className="hint">
            Your camera is sent in three resolutions at once. Each viewer automatically receives the one that fits their
            layout, so raising this only affects people viewing you full-screen.
          </p>
        </div>

        {isModerator && room.room && (
          <>
            <div className="section-label">Meeting controls</div>
            <Toggle
              label="Waiting room"
              hint="New participants must be admitted by a host."
              checked={room.room.lobbyEnabled}
              onChange={(lobbyEnabled) => void client.setRoomSettings({ lobbyEnabled })}
            />
            <Toggle
              label="Lock meeting"
              hint="Nobody new can join."
              checked={room.room.locked}
              onChange={(locked) => void client.setRoomSettings({ locked })}
            />
            <Toggle
              label="Participants can unmute"
              checked={room.room.allowUnmute}
              onChange={(allowUnmute) => void client.setRoomSettings({ allowUnmute })}
            />
            <Toggle
              label="Participants can share screen"
              checked={room.room.allowScreenShare}
              onChange={(allowScreenShare) => void client.setRoomSettings({ allowScreenShare })}
            />
            <Toggle
              label="Participants can chat"
              checked={room.room.allowChat}
              onChange={(allowChat) => void client.setRoomSettings({ allowChat })}
            />
          </>
        )}

        <div className="section-label">Connection</div>
        <div className="toggle-row">
          <span>Your network</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13 }}>
            <span className={`quality-dot quality-${room.quality}`} />
            {room.quality}
          </span>
        </div>
        <div className="toggle-row">
          <span>Signaling</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{room.connection}</span>
        </div>
        <div className="toggle-row">
          <span>Receiving streams</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{room.consumers.size}</span>
        </div>
      </div>
    </aside>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button className="toggle-row" style={{ width: '100%' }} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span style={{ textAlign: 'left' }}>
        {label}
        {hint && <div style={{ color: 'var(--text-faint)', fontSize: 11.5, marginTop: 2 }}>{hint}</div>}
      </span>
      <span className={`switch${checked ? ' on' : ''}`} />
    </button>
  );
}
