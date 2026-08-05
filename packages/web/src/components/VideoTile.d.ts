import { type NetworkQuality, type PeerInfo, type ProducerSource } from '@meet/protocol';
interface VideoTileProps {
    peer: PeerInfo;
    stream?: MediaStream;
    source: ProducerSource;
    /** Local preview: mirrored, and its audio is never played back. */
    isLocal?: boolean;
    isSpeaking?: boolean;
    audioLevel?: number;
    quality?: NetworkQuality;
    pinned?: boolean;
    onPin?: () => void;
    /** Tiles inside the filmstrip skip the hover controls. */
    compact?: boolean;
}
/**
 * One participant tile.
 *
 * Two behaviours matter for scale: the tile reports its rendered width so the
 * engine can request a matching simulcast layer, and it pauses its consumer when
 * scrolled out of view.
 */
export declare function VideoTile({ peer, stream, source, isLocal, isSpeaking, audioLevel, quality, pinned, onPin, compact, }: VideoTileProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=VideoTile.d.ts.map