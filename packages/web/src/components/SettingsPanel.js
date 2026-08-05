import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useRoomStore } from '../store/roomStore';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import { CloseIcon } from './icons';
const QUALITIES = [
    { value: 'low', label: 'Low — 320p (saves data)' },
    { value: 'medium', label: 'Medium — 360p' },
    { value: 'high', label: 'High — 720p (recommended)' },
    { value: 'hd1080', label: 'Full HD — 1080p' },
];
export function SettingsPanel({ client, room }) {
    const setPanel = useRoomStore((s) => s.setPanel);
    const pushToast = useRoomStore((s) => s.pushToast);
    const [devices, setDevices] = useState([]);
    useEffect(() => {
        const load = () => void client.listDevices().then(setDevices).catch(() => undefined);
        load();
        // Devices change when a headset is plugged in mid-meeting.
        navigator.mediaDevices?.addEventListener('devicechange', load);
        return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
    }, [client]);
    const change = async (kind, deviceId) => {
        try {
            await client.setDevice(kind, deviceId);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : 'Could not switch device', 'error');
        }
    };
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    const speakers = devices.filter((d) => d.kind === 'audiooutput');
    const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';
    return (_jsxs("aside", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: ["Settings", _jsx("span", { className: "spacer" }), _jsx("button", { className: "icon-btn", onClick: () => setPanel('none'), "aria-label": "Close settings", children: _jsx(CloseIcon, {}) })] }), _jsxs("div", { className: "panel-body", children: [_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "mic-select", children: "Microphone" }), _jsxs("select", { id: "mic-select", className: "select", value: room.local.selectedMicId ?? '', onChange: (event) => void change('audioinput', event.target.value), children: [_jsx("option", { value: "", children: "System default" }), mics.map((device) => (_jsx("option", { value: device.deviceId, children: device.label }, device.deviceId)))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "cam-select", children: "Camera" }), _jsxs("select", { id: "cam-select", className: "select", value: room.local.selectedCameraId ?? '', onChange: (event) => void change('videoinput', event.target.value), children: [_jsx("option", { value: "", children: "System default" }), cameras.map((device) => (_jsx("option", { value: device.deviceId, children: device.label }, device.deviceId)))] })] }), webMediaAdapter.supportsAudioOutputSelection && speakers.length > 0 && (_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "speaker-select", children: "Speaker" }), _jsxs("select", { id: "speaker-select", className: "select", value: room.local.selectedSpeakerId ?? '', onChange: (event) => void change('audiooutput', event.target.value), children: [_jsx("option", { value: "", children: "System default" }), speakers.map((device) => (_jsx("option", { value: device.deviceId, children: device.label }, device.deviceId)))] })] })), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "quality-select", children: "Video quality" }), _jsx("select", { id: "quality-select", className: "select", value: room.local.videoQuality, onChange: (event) => void client.setVideoQuality(event.target.value), children: QUALITIES.map((quality) => (_jsx("option", { value: quality.value, children: quality.label }, quality.value))) }), _jsx("p", { className: "hint", children: "Your camera is sent in three resolutions at once. Each viewer automatically receives the one that fits their layout, so raising this only affects people viewing you full-screen." })] }), isModerator && room.room && (_jsxs(_Fragment, { children: [_jsx("div", { className: "section-label", children: "Meeting controls" }), _jsx(Toggle, { label: "Waiting room", hint: "New participants must be admitted by a host.", checked: room.room.lobbyEnabled, onChange: (lobbyEnabled) => void client.setRoomSettings({ lobbyEnabled }) }), _jsx(Toggle, { label: "Lock meeting", hint: "Nobody new can join.", checked: room.room.locked, onChange: (locked) => void client.setRoomSettings({ locked }) }), _jsx(Toggle, { label: "Participants can unmute", checked: room.room.allowUnmute, onChange: (allowUnmute) => void client.setRoomSettings({ allowUnmute }) }), _jsx(Toggle, { label: "Participants can share screen", checked: room.room.allowScreenShare, onChange: (allowScreenShare) => void client.setRoomSettings({ allowScreenShare }) }), _jsx(Toggle, { label: "Participants can chat", checked: room.room.allowChat, onChange: (allowChat) => void client.setRoomSettings({ allowChat }) })] })), _jsx("div", { className: "section-label", children: "Connection" }), _jsxs("div", { className: "toggle-row", children: [_jsx("span", { children: "Your network" }), _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13 }, children: [_jsx("span", { className: `quality-dot quality-${room.quality}` }), room.quality] })] }), _jsxs("div", { className: "toggle-row", children: [_jsx("span", { children: "Signaling" }), _jsx("span", { style: { color: 'var(--text-dim)', fontSize: 13 }, children: room.connection })] }), _jsxs("div", { className: "toggle-row", children: [_jsx("span", { children: "Receiving streams" }), _jsx("span", { style: { color: 'var(--text-dim)', fontSize: 13 }, children: room.consumers.size })] })] })] }));
}
function Toggle({ label, hint, checked, onChange, }) {
    return (_jsxs("button", { className: "toggle-row", style: { width: '100%' }, onClick: () => onChange(!checked), role: "switch", "aria-checked": checked, children: [_jsxs("span", { style: { textAlign: 'left' }, children: [label, hint && _jsx("div", { style: { color: 'var(--text-faint)', fontSize: 11.5, marginTop: 2 }, children: hint })] }), _jsx("span", { className: `switch${checked ? ' on' : ''}` })] }));
}
//# sourceMappingURL=SettingsPanel.js.map