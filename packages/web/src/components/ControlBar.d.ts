import type { RoomClient, RoomState } from '@meet/client-core';
interface ControlBarProps {
    client: RoomClient;
    room: RoomState;
    onLeave: () => void;
}
export declare function ControlBar({ client, room, onLeave }: ControlBarProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ControlBar.d.ts.map