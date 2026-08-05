import type { ClientPlatform } from '@meet/protocol';
import type { DeviceOption, DisplayMediaStreamOptions, MediaAdapter } from '@meet/client-core';
/**
 * Browser implementation of the platform media contract.
 *
 * Two browser-specific details are handled here rather than in the shared engine:
 * device labels are empty until permission has been granted at least once, and
 * `setSinkId` (output routing) only exists in Chromium.
 */
export declare class WebMediaAdapter implements MediaAdapter {
    readonly platform: ClientPlatform;
    /** Undefined lets mediasoup-client pick the right handler for this browser. */
    readonly handlerName: undefined;
    private audioElements;
    private currentSinkId?;
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
    getDisplayMedia(options: DisplayMediaStreamOptions): Promise<MediaStream>;
    enumerateDevices(): Promise<DeviceOption[]>;
    supportsDisplayMedia(): boolean;
    supportsCameraSwitch(): boolean;
    /** Registers an <audio>/<video> element so output routing applies to it. */
    registerAudioElement(element: HTMLMediaElement): () => void;
    setAudioOutput(deviceId: string, element?: HTMLMediaElement): Promise<void>;
    get supportsAudioOutputSelection(): boolean;
}
export declare const webMediaAdapter: WebMediaAdapter;
//# sourceMappingURL=WebMediaAdapter.d.ts.map