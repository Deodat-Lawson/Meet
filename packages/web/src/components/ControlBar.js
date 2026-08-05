import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';
import { ChatIcon, GridIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, PhoneOffIcon, RecordIcon, ScreenShareIcon, ScreenShareOffIcon, SettingsIcon, SmileIcon, SpeakerViewIcon, UsersIcon, VideoIcon, VideoOffIcon, } from './icons';
const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🤔', '👋'];
export function ControlBar({ client, room, onLeave }) {
    const { panel, setPanel, layout, setLayout, pushToast, unreadChat } = useRoomStore();
    const [reactionsOpen, setReactionsOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const local = room.local;
    const isModerator = room.self?.role === 'host' || room.self?.role === 'co-host';
    const participantCount = room.peers.size + (room.self ? 1 : 0);
    const someoneElseSharing = Boolean(client.screenSharingPeerId && client.screenSharingPeerId !== room.self?.id);
    /** Wraps an async action so a failure surfaces as a toast instead of a dead button. */
    const run = async (key, action) => {
        if (busy)
            return;
        setBusy(key);
        try {
            await action();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Something went wrong.';
            // A cancelled share picker is a normal outcome, not a failure.
            if (!/cancelled/i.test(message))
                pushToast(message, 'error');
        }
        finally {
            setBusy(null);
        }
    };
    /* Keyboard shortcuts, matching Zoom's defaults where they exist. */
    useEffect(() => {
        const onKeyDown = (event) => {
            const target = event.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
                return;
            const mod = event.metaKey || event.ctrlKey;
            if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                void run('mic', () => client.toggleMic());
            }
            else if (mod && event.shiftKey && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                void run('cam', () => client.toggleCamera());
            }
            else if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                void run('share', () => client.toggleScreenShare());
            }
            else if (event.key === ' ' && !event.repeat && local.micMuted) {
                // Push-to-talk while the space bar is held.
                event.preventDefault();
                void client.unmuteMic();
                const onKeyUp = (e) => {
                    if (e.key === ' ') {
                        void client.muteMic();
                        window.removeEventListener('keyup', onKeyUp);
                    }
                };
                window.addEventListener('keyup', onKeyUp);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // `run` and `local.micMuted` are read fresh on each event via closure re-creation.
    }, [client, local.micMuted]);
    const micOn = local.micEnabled && !local.micMuted;
    return (_jsxs("div", { className: "controls", children: [_jsxs("button", { className: `control${micOn ? '' : ' off'}`, onClick: () => void run('mic', () => client.toggleMic()), disabled: busy === 'mic', title: micOn ? 'Mute (⌘⇧A)' : 'Unmute (⌘⇧A)', "aria-pressed": micOn, children: [_jsx("span", { className: "icon-wrap", children: micOn ? _jsx(MicIcon, {}) : _jsx(MicOffIcon, {}) }), micOn ? 'Mute' : 'Unmute'] }), _jsxs("button", { className: `control${local.cameraEnabled ? '' : ' off'}`, onClick: () => void run('cam', () => client.toggleCamera()), disabled: busy === 'cam', title: local.cameraEnabled ? 'Stop video (⌘⇧V)' : 'Start video (⌘⇧V)', "aria-pressed": local.cameraEnabled, children: [_jsx("span", { className: "icon-wrap", children: local.cameraEnabled ? _jsx(VideoIcon, {}) : _jsx(VideoOffIcon, {}) }), local.cameraEnabled ? 'Stop video' : 'Start video'] }), _jsxs("button", { className: `control${local.screenSharing ? ' on-accent' : ''}`, onClick: () => void run('share', () => client.toggleScreenShare()), disabled: busy === 'share' || (someoneElseSharing && !local.screenSharing), title: someoneElseSharing && !local.screenSharing
                    ? 'Someone else is sharing'
                    : local.screenSharing
                        ? 'Stop sharing (⌘⇧S)'
                        : 'Share screen (⌘⇧S)', "aria-pressed": local.screenSharing, children: [_jsx("span", { className: "icon-wrap", children: local.screenSharing ? _jsx(ScreenShareOffIcon, {}) : _jsx(ScreenShareIcon, {}) }), local.screenSharing ? 'Stop share' : 'Share'] }), _jsxs("button", { className: `control${panel === 'participants' ? ' active' : ''}`, onClick: () => setPanel(panel === 'participants' ? 'none' : 'participants'), title: "Participants", children: [_jsxs("span", { className: "icon-wrap", children: [_jsx(UsersIcon, {}), _jsx("span", { className: "control-count", children: participantCount })] }), "Participants"] }), _jsxs("button", { className: `control${panel === 'chat' ? ' active' : ''}`, onClick: () => setPanel(panel === 'chat' ? 'none' : 'chat'), title: "Chat", children: [_jsxs("span", { className: "icon-wrap", children: [_jsx(ChatIcon, {}), unreadChat > 0 && _jsx("span", { className: "control-count", children: unreadChat > 9 ? '9+' : unreadChat })] }), "Chat"] }), _jsxs("div", { className: "control-wrap", children: [_jsxs("button", { className: `control${reactionsOpen ? ' active' : ''}`, onClick: () => {
                            setReactionsOpen((open) => !open);
                            setMoreOpen(false);
                        }, title: "Reactions", "aria-expanded": reactionsOpen, children: [_jsx("span", { className: "icon-wrap", children: _jsx(SmileIcon, {}) }), "React"] }), reactionsOpen && (_jsx("div", { className: "reaction-bar", role: "menu", children: REACTIONS.map((emoji) => (_jsx("button", { onClick: () => {
                                void client.sendReaction(emoji);
                                setReactionsOpen(false);
                            }, title: `Send ${emoji}`, children: emoji }, emoji))) }))] }), _jsxs("button", { className: `control${room.self?.handRaised ? ' on-accent' : ''}`, onClick: () => void run('hand', () => client.raiseHand(!room.self?.handRaised)), title: room.self?.handRaised ? 'Lower hand' : 'Raise hand', "aria-pressed": Boolean(room.self?.handRaised), children: [_jsx("span", { className: "icon-wrap", children: _jsx(HandIcon, {}) }), room.self?.handRaised ? 'Lower' : 'Raise'] }), _jsxs("div", { className: "control-wrap", children: [_jsxs("button", { className: `control${moreOpen ? ' active' : ''}`, onClick: () => {
                            setMoreOpen((open) => !open);
                            setReactionsOpen(false);
                        }, title: "More options", "aria-expanded": moreOpen, children: [_jsx("span", { className: "icon-wrap", children: _jsx(MoreIcon, {}) }), "More"] }), moreOpen && (_jsx(MorePopover, { client: client, room: room, layout: layout, isModerator: isModerator, onClose: () => setMoreOpen(false), onLayout: setLayout, onSettings: () => {
                            setPanel('settings');
                            setMoreOpen(false);
                        }, onAction: run }))] }), _jsxs("button", { className: "leave-btn", onClick: onLeave, title: "Leave meeting", children: [_jsx(PhoneOffIcon, { size: 17 }), " Leave"] })] }));
}
function MorePopover({ client, room, layout, isModerator, onClose, onLayout, onSettings, onAction, }) {
    const ref = useRef(null);
    useEffect(() => {
        const onClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target))
                onClose();
        };
        // Deferred so the click that opened the popover does not immediately close it.
        const timer = setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', onClickOutside);
        };
    }, [onClose]);
    const recording = room.room?.recording ?? false;
    return (_jsxs("div", { className: "popover", ref: ref, style: { right: 0 }, role: "menu", children: [_jsxs("button", { className: "popover-item", onClick: () => {
                    onLayout(layout === 'gallery' ? 'speaker' : 'gallery');
                    onClose();
                }, children: [layout === 'gallery' ? _jsx(SpeakerViewIcon, { size: 17 }) : _jsx(GridIcon, { size: 17 }), layout === 'gallery' ? 'Speaker view' : 'Gallery view'] }), _jsxs("button", { className: "popover-item", onClick: onSettings, children: [_jsx(SettingsIcon, { size: 17 }), " Audio & video settings"] }), isModerator && (_jsxs(_Fragment, { children: [_jsxs("button", { className: "popover-item", onClick: () => {
                            void onAction('record', () => (recording ? client.stopRecording() : client.startRecording()));
                            onClose();
                        }, children: [_jsx(RecordIcon, { size: 17 }), " ", recording ? 'Stop recording' : 'Record meeting'] }), _jsxs("button", { className: "popover-item", onClick: () => {
                            void onAction('muteAll', () => client.muteAll(true));
                            onClose();
                        }, children: [_jsx(MicOffIcon, { size: 17 }), " Mute everyone"] }), _jsxs("button", { className: "popover-item", onClick: () => {
                            void onAction('lock', () => client.setRoomSettings({ locked: !room.room?.locked }));
                            onClose();
                        }, children: [_jsx(UsersIcon, { size: 17 }), " ", room.room?.locked ? 'Unlock meeting' : 'Lock meeting'] }), _jsxs("button", { className: "popover-item danger", onClick: () => {
                            if (confirm('End the meeting for everyone?'))
                                void onAction('end', () => client.endMeeting());
                            onClose();
                        }, children: [_jsx(PhoneOffIcon, { size: 17 }), " End meeting for all"] })] }))] }));
}
//# sourceMappingURL=ControlBar.js.map