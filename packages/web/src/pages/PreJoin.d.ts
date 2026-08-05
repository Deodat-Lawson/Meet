interface PreJoinProps {
    roomId: string;
    onCancel: () => void;
}
/**
 * Device check before entering the meeting.
 *
 * Getting a preview stream here does double duty: the user can see themselves,
 * and the permission prompt (plus the device labels it unlocks) happens before
 * they are on camera in front of other people.
 */
export declare function PreJoin({ roomId, onCancel }: PreJoinProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=PreJoin.d.ts.map