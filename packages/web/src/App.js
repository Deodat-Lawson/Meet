import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useRoomStore } from './store/roomStore';
import { Home } from './pages/Home';
import { PreJoin } from './pages/PreJoin';
import { RoomPage } from './pages/RoomPage';
import { CloseIcon } from './components/icons';
export function App() {
    const [path, setPath] = useState(location.pathname);
    const { status, fatalError, toasts, dismissToast, leave } = useRoomStore();
    const navigate = useCallback((next) => {
        history.pushState({}, '', next);
        setPath(next);
    }, []);
    useEffect(() => {
        const onPopState = () => setPath(location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    const roomId = path.match(/^\/room\/([^/?#]+)/)?.[1];
    const goHome = useCallback(() => {
        leave();
        navigate('/');
    }, [leave, navigate]);
    let content;
    if (!roomId) {
        content = _jsx(Home, { onNavigate: navigate });
    }
    else if (status === 'joined' || status === 'lobby') {
        content = _jsx(RoomPage, { roomId: roomId, onLeave: goHome });
    }
    else if (status === 'left' || status === 'error') {
        content = _jsx(MeetingEnded, { reason: fatalError, roomId: roomId, onRejoin: () => useRoomStore.setState({ status: 'idle', fatalError: null }), onHome: goHome });
    }
    else {
        content = _jsx(PreJoin, { roomId: roomId, onCancel: goHome });
    }
    return (_jsxs("div", { className: "app", children: [content, _jsx("div", { className: "toasts", children: toasts.map((toast) => (_jsxs("div", { className: `toast ${toast.tone}`, role: "status", children: [_jsx("span", { style: { flex: 1 }, children: toast.message }), _jsx("button", { className: "icon-btn", onClick: () => dismissToast(toast.id), "aria-label": "Dismiss", children: _jsx(CloseIcon, { size: 15 }) })] }, toast.id))) })] }));
}
function MeetingEnded({ reason, roomId, onRejoin, onHome, }) {
    return (_jsx("div", { className: "center-page", children: _jsxs("div", { className: "card", style: { textAlign: 'center' }, children: [_jsx("h1", { children: "You've left the meeting" }), _jsx("p", { className: "subtitle", children: reason ?? 'Thanks for joining.' }), _jsxs("button", { className: "btn btn-primary btn-block", onClick: onRejoin, children: ["Rejoin ", roomId] }), _jsx("button", { className: "btn btn-ghost btn-block", style: { marginTop: 8 }, onClick: onHome, children: "Back to home" })] }) }));
}
//# sourceMappingURL=App.js.map