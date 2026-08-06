import { create } from 'zustand';
import { Platform } from 'react-native';
import { RoomClient, type RoomState } from '@meet/client-core';
import type { MessageKey, ProducerSource, Reaction } from '@meet/protocol';
import { rnMediaAdapter } from '../adapters/RNMediaAdapter';
import { getServerConfig } from '../config';
import { fromError, type TranslatableText } from '../i18n';

/**
 * What a toast says, not how it reads — translated at render time so text
 * already on screen follows a language switch.
 */
export type ToastContent = TranslatableText;

export interface Toast {
  id: string;
  content: ToastContent;
  tone: 'info' | 'error' | 'success';
}

export interface FloatingReaction extends Reaction {
  key: string;
}

export type Panel = 'none' | 'participants' | 'chat';

interface JoinOptions {
  roomId: string;
  displayName: string;
  token?: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
}

interface RoomStore {
  client: RoomClient | null;
  room: RoomState | null;
  status: 'idle' | 'joining' | 'joined' | 'lobby' | 'left' | 'error';
  fatalError: ToastContent | null;
  toasts: Toast[];
  reactions: FloatingReaction[];
  panel: Panel;
  pinnedPeerId: string | null;
  unreadChat: number;
  speakerphone: boolean;

  join(options: JoinOptions): Promise<void>;
  leave(): void;
  setPanel(panel: Panel): void;
  pinPeer(peerId: string | null): void;
  pushToast(content: ToastContent, tone?: Toast['tone']): void;
  dismissToast(id: string): void;
  toggleSpeakerphone(): Promise<void>;
  setRenderSize(peerId: string, source: ProducerSource, width: number): void;
}

let toastCounter = 0;
let reactionCounter = 0;
/** Stable for the process lifetime so a reconnect is seen as the same peer. */
const peerId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);

export const useRoomStore = create<RoomStore>((set, get) => ({
  client: null,
  room: null,
  status: 'idle',
  fatalError: null,
  toasts: [],
  reactions: [],
  panel: 'none',
  pinnedPeerId: null,
  unreadChat: 0,
  speakerphone: true,

  async join(options) {
    get().client?.close();
    set({ status: 'joining', fatalError: null, reactions: [], unreadChat: 0 });

    const { wsUrl } = getServerConfig();
    const client = new RoomClient({
      url: wsUrl,
      roomId: options.roomId,
      peerId,
      displayName: options.displayName,
      token: options.token,
      media: rnMediaAdapter,
      initialMicEnabled: options.micEnabled,
      initialCameraEnabled: options.cameraEnabled,
      // Phones are on cellular as often as not; 360p keeps the uplink honest.
      videoQuality: 'medium',
      deviceName: `Meet ${Platform.OS === 'android' ? 'Android' : 'iOS'}`,
    });

    client.on('stateChanged', (room) => {
      set({ room, status: room.inLobby ? 'lobby' : room.joined ? 'joined' : get().status });
    });

    client.on('chatMessage', (message) => {
      const { panel, room, unreadChat } = get();
      if (panel !== 'chat' && message.peerId !== room?.self?.id) set({ unreadChat: unreadChat + 1 });
    });

    client.on('reaction', (reaction) => {
      const key = `reaction-${reactionCounter++}`;
      set({ reactions: [...get().reactions, { ...reaction, key }] });
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

    try {
      await client.join();
      // Meetings default to loudspeaker; nobody holds a phone to their ear on a call.
      await rnMediaAdapter.setSpeakerphone(true).catch(() => undefined);
    } catch (error) {
      set({ status: 'error', fatalError: fromError(error, 'room.joinFailed') });
      throw error;
    }
  },

  leave() {
    get().client?.close();
    set({ client: null, room: null, status: 'left', panel: 'none', pinnedPeerId: null, unreadChat: 0 });
  },

  setPanel: (panel) => set({ panel, unreadChat: panel === 'chat' ? 0 : get().unreadChat }),
  pinPeer: (pinnedPeerId) => set({ pinnedPeerId }),

  pushToast(content, tone = 'info') {
    const id = `toast-${toastCounter++}`;
    set({ toasts: [...get().toasts, { id, content, tone }] });
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  async toggleSpeakerphone() {
    const next = !get().speakerphone;
    await rnMediaAdapter.setSpeakerphone(next).catch(() => undefined);
    set({ speakerphone: next });
  },

  setRenderSize(peerId2, source, width) {
    get().client?.setRenderSize(peerId2, source, width);
  },
}));
