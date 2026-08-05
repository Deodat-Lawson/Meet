import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';
import { ChatIcon, CloseIcon, SendIcon } from './icons';
export function ChatPanel({ client, room }) {
    const setPanel = useRoomStore((s) => s.setPanel);
    const pushToast = useRoomStore((s) => s.pushToast);
    const [text, setText] = useState('');
    const [to, setTo] = useState('');
    const [sending, setSending] = useState(false);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    /* Keep the newest message in view, but never yank the view away from someone
       who has scrolled up to read history. */
    useEffect(() => {
        const list = listRef.current;
        if (!list)
            return;
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
        if (nearBottom)
            list.scrollTop = list.scrollHeight;
    }, [room.chat.length]);
    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    const send = async () => {
        const trimmed = text.trim();
        if (!trimmed || sending)
            return;
        setSending(true);
        try {
            await client.sendChatMessage(trimmed, to || undefined);
            setText('');
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : 'Message not sent', 'error');
        }
        finally {
            setSending(false);
        }
    };
    const peers = [...room.peers.values()];
    return (_jsxs("aside", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: ["Chat", _jsx("span", { className: "spacer" }), _jsx("button", { className: "icon-btn", onClick: () => setPanel('none'), "aria-label": "Close chat", children: _jsx(CloseIcon, {}) })] }), _jsx("div", { className: "panel-body", ref: listRef, children: room.chat.length === 0 ? (_jsxs("div", { className: "empty-state", children: [_jsx(ChatIcon, { size: 26 }), "No messages yet.", _jsx("span", { style: { fontSize: 12 }, children: "Messages are visible to everyone in the meeting." })] })) : (_jsx("div", { className: "chat-list", children: room.chat.map((message) => {
                        const isSelf = message.peerId === room.self?.id;
                        const recipient = message.to ? (message.to === room.self?.id ? 'you' : peers.find((p) => p.id === message.to)?.displayName) : null;
                        return (_jsxs("div", { children: [_jsxs("div", { className: "chat-msg-head", children: [_jsx("span", { className: "chat-author", style: { color: isSelf ? 'var(--accent)' : undefined }, children: isSelf ? 'You' : message.displayName }), recipient && _jsxs("span", { className: "chat-private", children: ["privately to ", recipient] }), _jsx("span", { className: "chat-time", children: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] }), _jsx("div", { className: "chat-text", children: message.text })] }, message.id));
                    }) })) }), _jsxs("div", { className: "panel-footer", children: [peers.length > 0 && (_jsxs("select", { className: "select", value: to, onChange: (event) => setTo(event.target.value), style: { marginBottom: 8, height: 34, fontSize: 13 }, children: [_jsx("option", { value: "", children: "To: Everyone" }), peers.map((peer) => (_jsxs("option", { value: peer.id, children: ["To: ", peer.displayName, " (private)"] }, peer.id)))] })), _jsxs("div", { className: "chat-input-row", children: [_jsx("textarea", { ref: inputRef, className: "chat-input", rows: 1, placeholder: "Type a message\u2026", value: text, maxLength: 4000, onChange: (event) => setText(event.target.value), onKeyDown: (event) => {
                                    // Enter sends; Shift+Enter inserts a newline.
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        void send();
                                    }
                                } }), _jsx("button", { className: "btn btn-primary", onClick: () => void send(), disabled: !text.trim() || sending, "aria-label": "Send message", children: _jsx(SendIcon, {}) })] })] })] }));
}
//# sourceMappingURL=ChatPanel.js.map