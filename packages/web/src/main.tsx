import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

// StrictMode is deliberately not used here: its double-invoked effects would open
// and immediately tear down real camera tracks and WebRTC transports, which the
// browser surfaces as a flickering preview and spurious "device in use" errors.
createRoot(container).render(<App />);
