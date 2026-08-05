import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import { useRoomStore } from '../store/roomStore';
import { CopyIcon, CheckIcon, LockIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../components/icons';
/**
 * Device check before entering the meeting.
 *
 * Getting a preview stream here does double duty: the user can see themselves,
 * and the permission prompt (plus the device labels it unlocks) happens before
 * they are on camera in front of other people.
 */
export function PreJoin({ roomId, onCancel }) {
    const join = useRoomStore((s) => s.join);
    const [displayName, setDisplayName] = useState(() => localStorage.getItem('meet.displayName') ?? '');
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [devices, setDevices] = useState([]);
    const [micId, setMicId] = useState('');
    const [cameraId, setCameraId] = useState('');
    const [previewStream, setPreviewStream] = useState(null);
    const [permissionError, setPermissionError] = useState(null);
    const [joinError, setJoinError] = useState(null);
    const [needsPasscode, setNeedsPasscode] = useState(false);
    const [passcode, setPasscode] = useState('');
    const [roomName, setRoomName] = useState(null);
    const [joining, setJoining] = useState(false);
    const [copied, setCopied] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    /* Look up the room so we know whether to ask for a passcode. */
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
            .then((response) => response.json())
            .then((data) => {
            if (cancelled)
                return;
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
            if (!cancelled)
                setPreviewStream(null);
            if (!cameraEnabled && !micEnabled)
                return;
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
            }
            catch (error) {
                if (!cancelled)
                    setPermissionError(error instanceof Error ? error.message : 'Could not access your devices.');
            }
        };
        void open();
        return () => {
            cancelled = true;
        };
    }, [cameraEnabled, micEnabled, cameraId, micId]);
    /* Release the preview when leaving this screen. */
    useEffect(() => () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);
    useEffect(() => {
        if (videoRef.current)
            videoRef.current.srcObject = previewStream;
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
                const body = (await tokenResponse.json().catch(() => ({})));
                throw new Error(body.message ?? 'Could not join this meeting.');
            }
            const { token } = (await tokenResponse.json());
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
        }
        catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Could not join this meeting.');
            setJoining(false);
        }
    };
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(`${location.origin}/room/${roomId}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            /* clipboard may be blocked; the link is visible on screen anyway */
        }
    };
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    return (_jsx("div", { className: "center-page", children: _jsxs("div", { className: "prejoin", children: [_jsxs("div", { className: "preview", children: [cameraEnabled && previewStream ? (_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: true })) : (_jsxs("div", { className: "preview-placeholder", children: [_jsx(VideoOffIcon, { size: 30 }), permissionError ? 'Camera unavailable' : 'Camera is off'] })), _jsxs("div", { className: "preview-controls", children: [_jsx("button", { className: `btn${micEnabled ? '' : ' btn-danger'}`, onClick: () => setMicEnabled((on) => !on), "aria-pressed": micEnabled, title: micEnabled ? 'Turn off microphone' : 'Turn on microphone', children: micEnabled ? _jsx(MicIcon, { size: 18 }) : _jsx(MicOffIcon, { size: 18 }) }), _jsx("button", { className: `btn${cameraEnabled ? '' : ' btn-danger'}`, onClick: () => setCameraEnabled((on) => !on), "aria-pressed": cameraEnabled, title: cameraEnabled ? 'Turn off camera' : 'Turn on camera', children: cameraEnabled ? _jsx(VideoIcon, { size: 18 }) : _jsx(VideoOffIcon, { size: 18 }) })] })] }), _jsxs("div", { className: "card", style: { width: '100%' }, children: [_jsx("h1", { children: "Ready to join?" }), _jsx("p", { className: "subtitle", children: roomName ?? `Meeting ${roomId}` }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "display-name", children: "Your name" }), _jsx("input", { id: "display-name", className: "input", placeholder: "Alex Rivera", value: displayName, maxLength: 64, autoFocus: true, onChange: (event) => setDisplayName(event.target.value), onKeyDown: (event) => event.key === 'Enter' && void handleJoin() })] }), needsPasscode && (_jsxs("div", { className: "field", children: [_jsxs("label", { htmlFor: "passcode", children: [_jsx(LockIcon, { size: 12 }), " Meeting passcode"] }), _jsx("input", { id: "passcode", className: "input", type: "password", value: passcode, onChange: (event) => setPasscode(event.target.value), onKeyDown: (event) => event.key === 'Enter' && void handleJoin() })] })), mics.length > 1 && (_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "prejoin-mic", children: "Microphone" }), _jsxs("select", { id: "prejoin-mic", className: "select", value: micId, onChange: (event) => setMicId(event.target.value), children: [_jsx("option", { value: "", children: "System default" }), mics.map((device) => (_jsx("option", { value: device.deviceId, children: device.label }, device.deviceId)))] })] })), cameras.length > 1 && (_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "prejoin-cam", children: "Camera" }), _jsxs("select", { id: "prejoin-cam", className: "select", value: cameraId, onChange: (event) => setCameraId(event.target.value), children: [_jsx("option", { value: "", children: "System default" }), cameras.map((device) => (_jsx("option", { value: device.deviceId, children: device.label }, device.deviceId)))] })] })), _jsx("button", { className: "btn btn-primary btn-block", onClick: () => void handleJoin(), disabled: joining, style: { marginTop: 6 }, children: joining ? _jsx("span", { className: "spinner" }) : 'Join now' }), _jsx("button", { className: "btn btn-ghost btn-block", style: { marginTop: 8 }, onClick: onCancel, children: "Cancel" }), permissionError && _jsx("p", { className: "error-text", children: permissionError }), joinError && _jsx("p", { className: "error-text", children: joinError }), _jsxs("div", { className: "copy-row", style: { marginTop: 16 }, children: [_jsx("code", { children: `${location.host}/room/${roomId}` }), _jsxs("button", { className: "btn btn-sm", onClick: () => void copyLink(), children: [copied ? _jsx(CheckIcon, { size: 14 }) : _jsx(CopyIcon, { size: 14 }), copied ? 'Copied' : 'Copy'] })] })] })] }) }));
}
//# sourceMappingURL=PreJoin.js.map