import { RoomClient, type RoomState } from '@meet/client-core';
import type { ProducerSource, Reaction } from '@meet/protocol';
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
export declare const useRoomStore: import("zustand").UseBoundStore<import("zustand").StoreApi<RoomStore>>;
export {};
//# sourceMappingURL=roomStore.d.ts.map