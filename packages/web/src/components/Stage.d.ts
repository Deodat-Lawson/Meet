import type { RoomClient, RoomState } from '@meet/client-core';
interface StageProps {
    client: RoomClient;
    room: RoomState;
}
/**
 * Chooses and renders the meeting layout.
 *
 * Priority mirrors Zoom: an active screen share always takes the main stage,
 * otherwise a pinned peer, otherwise the layout the user picked.
 */
export declare function Stage({ client, room }: StageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=Stage.d.ts.map