import type { NetworkQuality } from './types.js';

/** Room ids look like "abc-defg-hij" — easy to read out loud on a phone call. */
const ROOM_ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function generateRoomId(random: () => number = Math.random): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ROOM_ID_ALPHABET[Math.floor(random() * ROOM_ID_ALPHABET.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

export function isValidRoomId(id: string): boolean {
  return /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/.test(id) || /^[a-zA-Z0-9_-]{4,64}$/.test(id);
}

export function normalizeRoomId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, '');
}

/** Maps a mediasoup 0..10 score onto the UI quality buckets. */
export function qualityFromScore(score: number | undefined): NetworkQuality {
  if (score === undefined) return 'disconnected';
  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 3) return 'poor';
  return 'critical';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Deterministic colour for a peer avatar, derived from their id. */
export function colorForPeer(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash << 5) - hash + peerId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 45%)`;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
