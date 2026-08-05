import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { colorForPeer, initialsFor } from '@meet/protocol';
import { useRoomStore } from '../store/roomStore';
import { CloseIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, ScreenShareIcon, VideoIcon, VideoOffIcon } from './icons';
export function ParticipantsPanel({ client, room }) {
    const setPanel = useRoomStore((s) => s.setPanel);
    const pushToast = useRoomStore((s) => s.pushToast);
    const [menuFor, setMenuFor] = useState(null);
    const self = room.self;
    const isModerator = self?.role === 'host' || self?.role === 'co-host';
    const peers = [...room.peers.values()].sort((a, b) => {
        // Raised hands float to the top, then hosts, then join order.
        if (a.handRaised !== b.handRaised)
            return a.handRaised ? -1 : 1;
        if (a.role !== b.role)
            return a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0;
        return a.joinedAt - b.joinedAt;
    });
    const act = async (label, action) => {
        try {
            await action();
            pushToast(label, 'success');
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : 'Action failed', 'error');
        }
        finally {
            setMenuFor(null);
        }
    };
    return (_jsxs("aside", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: ["Participants (", peers.length + (self ? 1 : 0), ")", _jsx("span", { className: "spacer" }), _jsx("button", { className: "icon-btn", onClick: () => setPanel('none'), "aria-label": "Close participants", children: _jsx(CloseIcon, {}) })] }), _jsxs("div", { className: "panel-body", children: [room.lobbyPeers.length > 0 && isModerator && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "section-label", children: ["Waiting to join (", room.lobbyPeers.length, ")"] }), room.lobbyPeers.map((peer) => (_jsxs("div", { className: "participant", children: [_jsx(Avatar, { name: peer.displayName, id: peer.id }), _jsx("span", { className: "participant-name", children: peer.displayName }), _jsx("button", { className: "btn btn-sm btn-primary", onClick: () => void act('Admitted', () => client.admitLobbyPeer(peer.id, true)), children: "Admit" }), _jsx("button", { className: "btn btn-sm", onClick: () => void act('Denied', () => client.admitLobbyPeer(peer.id, false)), children: "Deny" })] }, peer.id))), _jsx("div", { className: "section-label", children: "In the meeting" })] })), self && _jsx(ParticipantRow, { peer: self, isSelf: true, audioLevel: room.audioLevels.get(self.id) ?? 0 }), peers.map((peer) => (_jsx(ParticipantRow, { peer: peer, audioLevel: room.audioLevels.get(peer.id) ?? 0, menuOpen: menuFor === peer.id, onToggleMenu: () => setMenuFor(menuFor === peer.id ? null : peer.id), actions: isModerator
                            ? {
                                mute: () => void act(`Muted ${peer.displayName}`, () => client.muteParticipant(peer.id)),
                                stopVideo: () => void act(`Stopped ${peer.displayName}'s video`, () => client.stopParticipantVideo(peer.id)),
                                stopShare: () => void act(`Stopped ${peer.displayName}'s share`, () => client.stopParticipantShare(peer.id)),
                                makeCoHost: () => void act(`${peer.displayName} is now a co-host`, () => client.setPeerRole(peer.id, peer.role === 'co-host' ? 'participant' : 'co-host')),
                                makeHost: self?.role === 'host'
                                    ? () => {
                                        if (confirm(`Make ${peer.displayName} the host? You will become a co-host.`)) {
                                            void act(`${peer.displayName} is now the host`, () => client.setPeerRole(peer.id, 'host'));
                                        }
                                    }
                                    : undefined,
                                remove: () => {
                                    if (confirm(`Remove ${peer.displayName} from the meeting?`)) {
                                        void act(`Removed ${peer.displayName}`, () => client.removeParticipant(peer.id));
                                    }
                                },
                            }
                            : undefined }, peer.id)))] }), isModerator && (_jsxs("div", { className: "panel-footer", style: { display: 'flex', gap: 8 }, children: [_jsx("button", { className: "btn btn-sm btn-block", onClick: () => void act('Everyone muted', () => client.muteAll(true)), children: "Mute all" }), _jsx("button", { className: "btn btn-sm btn-block", onClick: () => void act('Unmute allowed', () => client.setRoomSettings({ allowUnmute: true })), children: "Allow unmute" })] }))] }));
}
function ParticipantRow({ peer, isSelf = false, audioLevel, actions, menuOpen, onToggleMenu, }) {
    return (_jsxs("div", { className: "participant", style: { position: 'relative' }, children: [_jsx(Avatar, { name: peer.displayName, id: peer.id, level: audioLevel }), _jsxs("span", { className: "participant-name", children: [peer.displayName, isSelf && ' (you)', peer.role !== 'participant' && _jsxs("span", { className: "participant-role", children: [" \u00B7 ", peer.role === 'host' ? 'Host' : 'Co-host'] })] }), peer.handRaised && (_jsx("span", { style: { color: '#ffd166' }, title: "Hand raised", children: _jsx(HandIcon, { size: 15 }) })), peer.screenSharing && (_jsx("span", { style: { color: 'var(--accent)' }, title: "Sharing screen", children: _jsx(ScreenShareIcon, { size: 15 }) })), _jsx("span", { style: { color: peer.audioEnabled ? 'var(--text-dim)' : 'var(--danger)' }, children: peer.audioEnabled ? _jsx(MicIcon, { size: 15 }) : _jsx(MicOffIcon, { size: 15 }) }), _jsx("span", { style: { color: peer.videoEnabled ? 'var(--text-dim)' : 'var(--text-faint)' }, children: peer.videoEnabled ? _jsx(VideoIcon, { size: 15 }) : _jsx(VideoOffIcon, { size: 15 }) }), actions && (_jsx("div", { className: `participant-actions${menuOpen ? ' open' : ''}`, children: _jsx("button", { className: "icon-btn", onClick: onToggleMenu, "aria-label": `Options for ${peer.displayName}`, children: _jsx(MoreIcon, { size: 16 }) }) })), actions && menuOpen && (_jsxs("div", { className: "popover", style: { right: 4, bottom: 'auto', top: '100%', marginTop: 4, minWidth: 200 }, children: [_jsxs("button", { className: "popover-item", onClick: actions.mute, children: [_jsx(MicOffIcon, { size: 16 }), " Mute"] }), _jsxs("button", { className: "popover-item", onClick: actions.stopVideo, children: [_jsx(VideoOffIcon, { size: 16 }), " Stop video"] }), peer.screenSharing && (_jsxs("button", { className: "popover-item", onClick: actions.stopShare, children: [_jsx(ScreenShareIcon, { size: 16 }), " Stop screen share"] })), _jsx("button", { className: "popover-item", onClick: actions.makeCoHost, children: peer.role === 'co-host' ? 'Remove co-host' : 'Make co-host' }), actions.makeHost && (_jsx("button", { className: "popover-item", onClick: actions.makeHost, children: "Make host" })), _jsx("button", { className: "popover-item danger", onClick: actions.remove, children: "Remove from meeting" })] }))] }));
}
function Avatar({ name, id, level = 0 }) {
    return (_jsx("div", { className: "avatar", style: {
            width: 32,
            height: 32,
            fontSize: 12,
            background: colorForPeer(id),
            boxShadow: level > 0.08 ? `0 0 0 ${1 + level * 3}px rgb(34 197 94 / 45%)` : undefined,
            transition: 'box-shadow 90ms linear',
            flexShrink: 0,
        }, children: initialsFor(name) }));
}
//# sourceMappingURL=ParticipantsPanel.js.map