import { Platform } from 'react-native';

const STORAGE_KEY = 'meet.serverUrl';

/**
 * Where the app points by default.
 *
 * On the Android emulator, 10.0.2.2 is the host machine's loopback; on a real
 * device it has to be the machine's LAN address (or the production hostname),
 * which is why the value is editable from the home screen.
 */
const DEFAULT_SERVER = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://127.0.0.1:4000';

let currentServer = DEFAULT_SERVER;

export function getServerConfig(): { httpUrl: string; wsUrl: string } {
  const httpUrl = currentServer.replace(/\/+$/, '');
  const wsUrl = `${httpUrl.replace(/^http/, 'ws')}/ws`;
  return { httpUrl, wsUrl };
}

export function setServerUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  currentServer = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function getServerUrl(): string {
  return currentServer;
}

export { STORAGE_KEY };
