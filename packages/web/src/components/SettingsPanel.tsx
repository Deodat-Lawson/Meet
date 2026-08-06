import { useEffect, useState } from 'react';
import type { DeviceOption, RoomClient, RoomState } from '@meet/client-core';
import type { MessageKey, VideoQuality } from '@meet/protocol';
import { useRoomStore, toastFromError } from '../store/roomStore';
import { useT } from '../i18n';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import { CloseIcon } from './icons';
import { LanguageToggle } from './LanguageToggle';

const QUALITIES: Array<{ value: VideoQuality; label: MessageKey }> = [
  { value: 'low', label: 'settings.qualityLow' },
  { value: 'medium', label: 'settings.qualityMedium' },
  { value: 'high', label: 'settings.qualityHigh' },
  { value: 'hd1080', label: 'settings.qualityHd1080' },
];

/** `RoomState.quality` / `.connection` are wire values, not display strings. */
const QUALITY_KEYS: Record<string, MessageKey> = {
  excellent: 'quality.excellent',
  good: 'quality.good',
  poor: 'quality.poor',
  critical: 'quality.critical',
  disconnected: 'quality.disconnected',
};

const CONNECTION_KEYS: Record<string, MessageKey> = {
  new: 'connection.new',
  connecting: 'connection.connecting',
  connected: 'connection.connected',
  reconnecting: 'connection.reconnecting',
  closed: 'connection.closed',
  failed: 'connection.failed',
};

export function SettingsPanel({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const t = useT();
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
      pushToast(toastFromError(error, 'settings.deviceSwitchFailed'), 'error');
    }
  };

  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');
  const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';

  return (
    <aside className="panel">
      <div className="panel-header">
        {t('settings.title')}
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label={t('settings.close')}>
          <CloseIcon />
        </button>
      </div>

      <div className="panel-body">
        <div className="toggle-row">
          <span>{t('language.label')}</span>
          <LanguageToggle />
        </div>

        <div className="field">
          <label htmlFor="mic-select">{t('settings.microphone')}</label>
          <select
            id="mic-select"
            className="select"
            value={room.local.selectedMicId ?? ''}
            onChange={(event) => void change('audioinput', event.target.value)}
          >
            <option value="">{t('common.systemDefault')}</option>
            {mics.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cam-select">{t('settings.camera')}</label>
          <select
            id="cam-select"
            className="select"
            value={room.local.selectedCameraId ?? ''}
            onChange={(event) => void change('videoinput', event.target.value)}
          >
            <option value="">{t('common.systemDefault')}</option>
            {cameras.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        {webMediaAdapter.supportsAudioOutputSelection && speakers.length > 0 && (
          <div className="field">
            <label htmlFor="speaker-select">{t('settings.speaker')}</label>
            <select
              id="speaker-select"
              className="select"
              value={room.local.selectedSpeakerId ?? ''}
              onChange={(event) => void change('audiooutput', event.target.value)}
            >
              <option value="">{t('common.systemDefault')}</option>
              {speakers.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="quality-select">{t('settings.videoQuality')}</label>
          <select
            id="quality-select"
            className="select"
            value={room.local.videoQuality}
            onChange={(event) => void client.setVideoQuality(event.target.value as VideoQuality)}
          >
            {QUALITIES.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {t(quality.label)}
              </option>
            ))}
          </select>
          <p className="hint">{t('settings.qualityHint')}</p>
        </div>

        {isModerator && room.room && (
          <>
            <div className="section-label">{t('settings.meetingControls')}</div>
            <Toggle
              label={t('settings.waitingRoom')}
              hint={t('settings.waitingRoomHint')}
              checked={room.room.lobbyEnabled}
              onChange={(lobbyEnabled) => void client.setRoomSettings({ lobbyEnabled })}
            />
            <Toggle
              label={t('settings.lockMeeting')}
              hint={t('settings.lockMeetingHint')}
              checked={room.room.locked}
              onChange={(locked) => void client.setRoomSettings({ locked })}
            />
            <Toggle
              label={t('settings.allowUnmute')}
              checked={room.room.allowUnmute}
              onChange={(allowUnmute) => void client.setRoomSettings({ allowUnmute })}
            />
            <Toggle
              label={t('settings.allowScreenShare')}
              checked={room.room.allowScreenShare}
              onChange={(allowScreenShare) => void client.setRoomSettings({ allowScreenShare })}
            />
            <Toggle
              label={t('settings.allowChat')}
              checked={room.room.allowChat}
              onChange={(allowChat) => void client.setRoomSettings({ allowChat })}
            />
          </>
        )}

        <div className="section-label">{t('settings.connection')}</div>
        <div className="toggle-row">
          <span>{t('settings.yourNetwork')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13 }}>
            <span className={`quality-dot quality-${room.quality}`} />
            {t(QUALITY_KEYS[room.quality] ?? 'quality.disconnected')}
          </span>
        </div>
        <div className="toggle-row">
          <span>{t('settings.signaling')}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            {t(CONNECTION_KEYS[room.connection] ?? 'connection.closed')}
          </span>
        </div>
        <div className="toggle-row">
          <span>{t('settings.receivingStreams')}</span>
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
