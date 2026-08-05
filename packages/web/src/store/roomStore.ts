import { create } from 'zustand';
import { RoomClient, type RoomState } from '@meet/client-core';
import type { ProducerSource, Reaction } from '@meet/protocol';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'error' | 'success';
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
  fatalError: string | null;
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
  pushToast(message: string, tone?: Toast['tone']): void;
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
      const messages = {
        mute: `${action.byDisplayName} muted you`,
        stopVideo: `${action.byDisplayName} stopped your video`,
        stopShare: `${action.byDisplayName} stopped your screen share`,
        unmuteRequest: `${action.byDisplayName} asked you to unmute`,
      } as const;
      get().pushToast(messages[action.action], 'info');
    });

    client.on('error', ({ message }) => get().pushToast(message, 'error'));

    client.on('removed', ({ reason }) => set({ status: 'left', fatalError: reason }));
    client.on('meetingEnded', ({ reason }) => set({ status: 'left', fatalError: reason }));
    client.on('lobbyDenied', ({ reason }) => set({ status: 'left', fatalError: reason }));

    set({ client });

    // Handle for the end-to-end suite and for debugging a live meeting from the
    // console. Never exposed in a production build.
    if (import.meta.env.DEV) {
      (window as unknown as { __meet?: unknown }).__meet = client;
    }

    try {
      if (options.micDeviceId) await client.setDevice('audioinput', options.micDeviceId).catch(() => undefined);
      if (options.cameraDeviceId) await client.setDevice('videoinput', options.cameraDeviceId).catch(() => undefined);
      await client.join();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join the meeting.';
      set({ status: 'error', fatalError: message });
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

  pushToast(message, tone = 'info') {
    const id = `toast-${toastCounter++}`;
    set({ toasts: [...get().toasts, { id, message, tone }] });
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
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    sessionStorage.setItem(key, id);
  }
  return id;
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}
