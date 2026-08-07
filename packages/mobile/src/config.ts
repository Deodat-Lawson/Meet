import { Platform } from 'react-native';

const STORAGE_KEY = 'meet.serverUrl';

/**
 * Where the app points by default.
 *
 * The hosted deployment, so an installed app works with no configuration. It is
 * HTTPS deliberately: release builds reject cleartext traffic, which is the
 * right default and means a plain-HTTP address only works in a debug build.
 *
 * Server settings on the home screen overrides this — 10.0.2.2 reaches the host
 * machine from the Android emulator, and a LAN address works on a real device
 * against a locally running stack.
 */
const DEFAULT_SERVER = 'https://meet.team-studio.space';

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
