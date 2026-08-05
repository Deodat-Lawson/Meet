import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { formatDuration } from '@meet/protocol';
import { useRoomStore } from '../store/roomStore';
import { Stage } from '../components/Stage';
import { ControlBar } from '../components/ControlBar';
import { ParticipantsPanel } from '../components/ParticipantsPanel';
import { ChatPanel } from '../components/ChatPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { AudioRenderer } from '../components/AudioRenderer';
import { CheckIcon, CopyIcon, LockIcon } from '../components/icons';
export function RoomPage({ roomId, onLeave }) {
    const { client, room, panel, reactions, leave } = useRoomStore();
    const [elapsed, setElapsed] = useState(0);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        const started = Date.now();
        const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
        return () => clearInterval(timer);
    }, []);
    /* Warn before an accidental tab close mid-meeting. */
    useEffect(() => {
        const onBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);
    if (!client || !room)
        return null;
    if (room.inLobby) {
        return (_jsx("div", { className: "center-page", children: _jsxs("div", { className: "card", style: { textAlign: 'center' }, children: [_jsx("div", { className: "spinner", style: { margin: '0 auto 16px' } }), _jsx("h1", { children: "Waiting to be admitted" }), _jsx("p", { className: "subtitle", children: "The host has been notified. You'll join automatically once they let you in." }), _jsx("button", { className: "btn btn-ghost btn-block", onClick: () => {
                            leave();
                            onLeave();
                        }, children: "Cancel" })] }) }));
    }
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(`${location.origin}/room/${roomId}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            /* clipboard permission denied */
        }
    };
    const consumers = [...room.consumers.values()];
    const reconnecting = room.connection === 'reconnecting' || room.connection === 'connecting';
    return (_jsxs("div", { className: "room", children: [_jsxs("header", { className: "room-header", children: [_jsx("span", { className: "room-title", children: room.room?.name ?? `Meeting ${roomId}` }), _jsx("span", { className: "room-meta", children: formatDuration(elapsed) }), room.room?.locked && (_jsxs("span", { className: "badge", title: "Meeting is locked", children: [_jsx(LockIcon, { size: 12 }), " Locked"] })), room.room?.recording && (_jsxs("span", { className: "badge badge-rec", children: [_jsx("span", { className: "dot" }), " Recording"] })), reconnecting && (_jsx("span", { className: "badge", style: { color: 'var(--warn)' }, children: "Reconnecting\u2026" })), _jsx("span", { className: "spacer" }), _jsxs("button", { className: "btn btn-sm", onClick: () => void copyLink(), title: "Copy the meeting link", children: [copied ? _jsx(CheckIcon, { size: 14 }) : _jsx(CopyIcon, { size: 14 }), copied ? 'Copied' : 'Copy link'] })] }), _jsxs("div", { className: "room-body", children: [_jsxs("main", { className: "stage", children: [_jsx(Stage, { client: client, room: room }), _jsx("div", { className: "reaction-layer", children: reactions.map((reaction, index) => (_jsxs("div", { className: "floating-reaction", 
                                    // Spread reactions horizontally so simultaneous ones do not overlap.
                                    style: { left: `${8 + ((index * 17 + reaction.peerId.charCodeAt(0)) % 80)}%` }, children: [reaction.emoji, _jsx("span", { children: reaction.displayName })] }, reaction.key))) })] }), panel === 'participants' && _jsx(ParticipantsPanel, { client: client, room: room }), panel === 'chat' && _jsx(ChatPanel, { client: client, room: room }), panel === 'settings' && _jsx(SettingsPanel, { client: client, room: room })] }), _jsx(ControlBar, { client: client, room: room, onLeave: () => {
                    leave();
                    onLeave();
                } }), _jsx(AudioRenderer, { consumers: consumers, outputDeviceId: room.local.selectedSpeakerId })] }));
}
//# sourceMappingURL=RoomPage.js.map