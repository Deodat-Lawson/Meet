import type { ConsumerEntry } from '@meet/client-core';
/**
 * Plays every remote audio track through its own hidden element.
 *
 * Audio is kept out of the video tiles on purpose: a tile can be unmounted by a
 * layout change or scrolled out of view, and losing someone's voice because their
 * thumbnail scrolled off screen is the worst bug a meeting app can have.
 */
export declare function AudioRenderer({ consumers, outputDeviceId }: {
    consumers: ConsumerEntry[];
    outputDeviceId?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=AudioRenderer.d.ts.map