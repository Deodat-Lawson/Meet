import { create } from 'zustand';
import { RoomClient, type RoomState } from '@meet/client-core';
import type { MessageKey, ProducerSource, Reaction } from '@meet/protocol';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
import type { TranslatableText } from '../i18n';

/**
 * What a toast says, not how it reads.
 *
 * Storing the key (or the raw server text) instead of a finished sentence is
 * what lets a toast that is already on screen follow a language switch.
 */
export type ToastContent = TranslatableText;

export interface Toast {
  id: string;
  content: ToastContent;
  tone: 'info' | 'error' | 'success';
}

/**
 * An error is shown verbatim when it carries a message — `translateServerText`
 * maps the ones we recognise at render time — and falls back to `key` when it
 * does not.
 */
export function toastFromError(error: unknown, fallback: MessageKey): ToastContent {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? { text: message } : { key: fallback };
}

export interface FloatingReaction extends Reaction {
  key: string;
}

export type Layout = 'gallery' | 'speaker';
export type SidePanel = 'none' | 'participants' | 'chat' | 'settings';

interface JoinOptions {
  roomId: string;
  displayName: string;
  token?: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  micDeviceId?: string;
  cameraDeviceId?: string;
}

interface RoomStore {
  client: RoomClient | null;
  room: RoomState | null;
  status: 'idle' | 'joining' | 'joined' | 'lobby' | 'left' | 'error';
  /** Why the meeting ended, in the same translatable shape as a toast. */
  fatalError: ToastContent | null;
  toasts: Toast[];
  reactions: FloatingReaction[];
  layout: Layout;
  panel: SidePanel;
  pinnedPeerId: string | null;
  unreadChat: number;

  join(options: JoinOptions): Promise<void>;
  leave(): void;
  setLayout(layout: Layout): void;
  setPanel(panel: SidePanel): void;
  pinPeer(peerId: string | null): void;
  pushToast(content: ToastContent, tone?: Toast['tone']): void;
  dismissToast(id: string): void;
  markChatRead(): void;
  setRenderSize(peerId: string, source: ProducerSource, width: number): void;
}

let toastCounter = 0;
let reactionCounter = 0;

export const useRoomStore = create<RoomStore>((set, get) => ({
  client: null,
  room: null,
  status: 'idle',
  fatalError: null,
  toasts: [],
  reactions: [],
  layout: 'gallery',
  panel: 'none',
  pinnedPeerId: null,
  unreadChat: 0,

  async join(options) {
    const existing = get().client;
    if (existing) existing.close();

    set({ status: 'joining', fatalError: null });

    const peerId = getOrCreatePeerId();
    const client = new RoomClient({
      url: buildWebSocketUrl(),
      roomId: options.roomId,
      peerId,
      displayName: options.displayName,
      token: options.token,
      media: webMediaAdapter,
      initialMicEnabled: options.micEnabled,
      initialCameraEnabled: options.cameraEnabled,
      deviceName: browserName(),
    });

    client.on('stateChanged', (room) => {
      set({ room, status: room.inLobby ? 'lobby' : room.joined ? 'joined' : get().status });
    });

    client.on('chatMessage', (message) => {
      const { panel, room, unreadChat } = get();
      if (panel !== 'chat' && message.peerId !== room?.self?.id) {
        set({ unreadChat: unreadChat + 1 });
      }
    });

    client.on('reaction', (reaction) => {
      const key = `reaction-${reactionCounter++}`;
      set({ reactions: [...get().reactions, { ...reaction, key }] });
      // Reactions float for three seconds and then disappear, Zoom-style.
      setTimeout(() => set({ reactions: get().reactions.filter((r) => r.key !== key) }), 3000);
    });

    client.on('moderatorAction', (action) => {
      const keys = {
        mute: 'moderator.muted',
        stopVideo: 'moderator.stoppedVideo',
        stopShare: 'moderator.stoppedShare',
        unmuteRequest: 'moderator.unmuteRequest',
      } as const satisfies Record<typeof action.action, MessageKey>;
      get().pushToast({ key: keys[action.action], params: { name: action.byDisplayName } }, 'info');
    });

    client.on('error', ({ message }) => get().pushToast({ text: message }, 'error'));

    client.on('removed', ({ reason }) => set({ status: 'left', fatalError: { text: reason } }));
    client.on('meetingEnded', ({ reason }) => set({ status: 'left', fatalError: { text: reason } }));
    client.on('lobbyDenied', ({ reason }) => set({ status: 'left', fatalError: { text: reason } }));

    set({ client });

    // Handles for the end-to-end suite and for debugging a live meeting from the
    // console: the engine, and the UI store so a panel can be opened without
    // clicking a button whose label is itself under test. Never exposed in a
    // production build.
    if (import.meta.env.DEV) {
      const debug = window as unknown as { __meet?: unknown; __meetStore?: unknown };
      debug.__meet = client;
      debug.__meetStore = useRoomStore;
    }

    try {
      if (options.micDeviceId) await client.setDevice('audioinput', options.micDeviceId).catch(() => undefined);
      if (options.cameraDeviceId) await client.setDevice('videoinput', options.cameraDeviceId).catch(() => undefined);
      await client.join();
    } catch (error) {
      set({ status: 'error', fatalError: toastFromError(error, 'room.joinFailed') });
      throw error;
    }
  },

  leave() {
    get().client?.close();
    set({ client: null, room: null, status: 'left', panel: 'none', pinnedPeerId: null, unreadChat: 0 });
  },

  setLayout: (layout) => set({ layout }),
  setPanel: (panel) => set({ panel, unreadChat: panel === 'chat' ? 0 : get().unreadChat }),
  pinPeer: (pinnedPeerId) => set({ pinnedPeerId, layout: pinnedPeerId ? 'speaker' : get().layout }),

  pushToast(content, tone = 'info') {
    const id = `toast-${toastCounter++}`;
    set({ toasts: [...get().toasts, { id, content, tone }] });
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  markChatRead: () => set({ unreadChat: 0 }),

  setRenderSize(peerId, source, width) {
    get().client?.setRenderSize(peerId, source, width);
  },
}));

/* ------------------------------------------------------------------ utils */

function buildWebSocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

/**
 * A stable per-tab peer id so a reconnect is recognised as the same participant
 * rather than a duplicate. Session storage keeps two tabs independent.
 */
function getOrCreatePeerId(): string {
  const key = 'meet.peerId';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = randomPeerId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

/**
 * 16 random hex characters.
 *
 * `crypto.randomUUID` is only defined in a secure context, and the dev server
 * is routinely reached over plain HTTP on a LAN address or a tunnel — where it
 * is missing entirely and joining used to die on a TypeError before the socket
 * was ever opened. `getRandomValues` has no such restriction.
 */
function randomPeerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}
