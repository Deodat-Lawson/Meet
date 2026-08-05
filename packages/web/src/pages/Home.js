import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { normalizeRoomId } from '@meet/protocol';
import { VideoIcon } from '../components/icons';
export function Home({ onNavigate }) {
    const [joinCode, setJoinCode] = useState('');
    const [meetingName, setMeetingName] = useState('');
    const [passcode, setPasscode] = useState('');
    const [lobbyEnabled, setLobbyEnabled] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
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
            if (!response.ok)
                throw new Error('Could not create the meeting. Please try again.');
            const { roomId } = (await response.json());
            onNavigate(`/room/${roomId}`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the meeting.');
        }
        finally {
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
    return (_jsx("div", { className: "center-page", children: _jsxs("div", { className: "card", children: [_jsxs("div", { className: "brand", children: [_jsx("span", { className: "brand-mark", children: _jsx(VideoIcon, { size: 18 }) }), "Meet"] }), _jsx("h1", { children: "Start or join a meeting" }), _jsx("p", { className: "subtitle", children: "Video, audio and screen sharing that runs in your browser. No download, no account." }), _jsx("button", { className: "btn btn-primary btn-block", onClick: () => void createMeeting(), disabled: creating, children: creating ? _jsx("span", { className: "spinner" }) : 'New meeting' }), _jsx("button", { className: "btn btn-block", style: { marginTop: 8, background: 'transparent', color: 'var(--text-dim)', height: 32, fontSize: 13 }, onClick: () => setShowOptions((open) => !open), children: showOptions ? 'Hide options' : 'Meeting options' }), showOptions && (_jsxs("div", { style: { marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--surface-2)' }, children: [_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "meeting-name", children: "Meeting name" }), _jsx("input", { id: "meeting-name", className: "input", placeholder: "Weekly standup", value: meetingName, maxLength: 120, onChange: (event) => setMeetingName(event.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "meeting-passcode", children: "Passcode (optional)" }), _jsx("input", { id: "meeting-passcode", className: "input", placeholder: "At least 4 characters", value: passcode, maxLength: 32, onChange: (event) => setPasscode(event.target.value) })] }), _jsxs("button", { className: "toggle-row", style: { width: '100%', padding: '4px 0' }, onClick: () => setLobbyEnabled(!lobbyEnabled), role: "switch", "aria-checked": lobbyEnabled, children: [_jsx("span", { children: "Waiting room" }), _jsx("span", { className: `switch${lobbyEnabled ? ' on' : ''}` })] })] })), _jsx("div", { className: "divider", children: "or" }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "join-code", children: "Join with a code" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { id: "join-code", className: "input", placeholder: "abc-defg-hij", value: joinCode, onChange: (event) => setJoinCode(event.target.value), onKeyDown: (event) => event.key === 'Enter' && joinMeeting(), autoComplete: "off", spellCheck: false }), _jsx("button", { className: "btn", onClick: joinMeeting, disabled: !joinCode.trim(), children: "Join" })] })] }), error && _jsx("p", { className: "error-text", children: error }), _jsx("p", { className: "hint", children: "Works in Chrome, Edge, Firefox and Safari, and in the Meet Android app. Screen sharing needs a desktop browser or the Android app." })] }) }));
}
//# sourceMappingURL=Home.js.map