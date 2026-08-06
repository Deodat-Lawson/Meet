import { useCallback, useEffect, useState } from 'react';
import { useRoomStore, type ToastContent } from './store/roomStore';
import { useT, useTranslatable } from './i18n';
import { Home } from './pages/Home';
import { PreJoin } from './pages/PreJoin';
import { RoomPage } from './pages/RoomPage';
import { CloseIcon } from './components/icons';
import { LanguageToggle } from './components/LanguageToggle';

export function App() {
  const [path, setPath] = useState(location.pathname);
  const { status, fatalError, toasts, dismissToast, leave } = useRoomStore();
  const t = useT();
  const text = useTranslatable();

  const navigate = useCallback((next: string) => {
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

  let content: React.ReactNode;

  if (!roomId) {
    content = <Home onNavigate={navigate} />;
  } else if (status === 'joined' || status === 'lobby') {
    content = <RoomPage roomId={roomId} onLeave={goHome} />;
  } else if (status === 'left' || status === 'error') {
    content = <MeetingEnded reason={fatalError} roomId={roomId} onRejoin={() => useRoomStore.setState({ status: 'idle', fatalError: null })} onHome={goHome} />;
  } else {
    content = <PreJoin roomId={roomId} onCancel={goHome} />;
  }

  return (
    <div className="app">
      {content}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <span style={{ flex: 1 }}>{text(toast.content)}</span>
            <button className="icon-btn" onClick={() => dismissToast(toast.id)} aria-label={t('common.dismiss')}>
              <CloseIcon size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingEnded({
  reason,
  roomId,
  onRejoin,
  onHome,
}: {
  reason: ToastContent | null;
  roomId: string;
  onRejoin: () => void;
  onHome: () => void;
}) {
  const t = useT();
  const text = useTranslatable();

  return (
    <div className="center-page">
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="card-topbar" style={{ justifyContent: 'flex-end' }}>
          <LanguageToggle />
        </div>
        <h1>{t('room.leftTitle')}</h1>
        <p className="subtitle">{reason ? text(reason) : t('room.leftSubtitle')}</p>
        <button className="btn btn-primary btn-block" onClick={onRejoin}>
          {t('room.rejoin', { id: roomId })}
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onHome}>
          {t('room.backHome')}
        </button>
      </div>
    </div>
  );
}
