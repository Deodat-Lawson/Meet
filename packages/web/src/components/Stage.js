import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { VideoTile } from './VideoTile';
import { useRoomStore } from '../store/roomStore';
import { ScreenShareIcon } from './icons';
/**
 * Chooses and renders the meeting layout.
 *
 * Priority mirrors Zoom: an active screen share always takes the main stage,
 * otherwise a pinned peer, otherwise the layout the user picked.
 */
export function Stage({ client, room }) {
    const layout = useRoomStore((s) => s.layout);
    const pinnedPeerId = useRoomStore((s) => s.pinnedPeerId);
    const pinPeer = useRoomStore((s) => s.pinPeer);
    const self = room.self;
    const allPeers = useMemo(() => {
        const peers = [...room.peers.values()];
        return self ? [self, ...peers] : peers;
    }, [room.peers, self]);
    const sharingPeerId = client.screenSharingPeerId;
    const sharingPeer = sharingPeerId ? allPeers.find((p) => p.id === sharingPeerId) : undefined;
    const isSharingLocally = Boolean(self && sharingPeerId === self.id);
    const screenStream = sharingPeerId
        ? isSharingLocally
            ? client.getLocalStream('screen')
            : client.getStream(sharingPeerId, 'screen')
        : undefined;
    const streamFor = (peer) => self && peer.id === self.id ? client.getLocalStream('webcam') : client.getStream(peer.id, 'webcam');
    const tileFor = (peer, compact = false) => (_jsx(VideoTile, { peer: peer, source: "webcam", stream: streamFor(peer), isLocal: Boolean(self && peer.id === self.id), isSpeaking: room.activeSpeakerId === peer.id, audioLevel: room.audioLevels.get(peer.id) ?? 0, quality: self && peer.id === self.id ? room.quality : client.qualityForPeer(peer.id), pinned: pinnedPeerId === peer.id, onPin: compact ? undefined : () => pinPeer(pinnedPeerId === peer.id ? null : peer.id), compact: compact }, peer.id));
    /* --------------------------------------------------------- screen share */
    if (sharingPeerId && screenStream && sharingPeer) {
        const others = allPeers.filter((p) => p.id !== sharingPeerId);
        return (_jsxs("div", { className: `share-layout${others.length === 0 ? ' no-strip' : ''}`, children: [_jsx(ScreenStage, { stream: screenStream, peer: sharingPeer, isLocal: isSharingLocally, onSizeChange: (width) => {
                        if (!isSharingLocally)
                            client.setRenderSize(sharingPeerId, 'screen', width);
                    }, onVisibilityChange: (visible) => {
                        if (!isSharingLocally)
                            void client.setConsumerVisible(sharingPeerId, 'screen', visible);
                    } }), others.length > 0 && (_jsxs("div", { className: "filmstrip", children: [tileFor(sharingPeer, true), others.map((peer) => tileFor(peer, true))] }))] }));
    }
    /* --------------------------------------------------- pinned / speaker */
    const focusId = pinnedPeerId ?? (layout === 'speaker' ? (room.activeSpeakerId ?? allPeers[0]?.id) : null);
    if (focusId && allPeers.length > 1) {
        const focused = allPeers.find((p) => p.id === focusId) ?? allPeers[0];
        const others = allPeers.filter((p) => p.id !== focused.id);
        return (_jsxs("div", { className: "share-layout", children: [_jsx("div", { className: "share-stage", children: tileFor(focused) }), _jsx("div", { className: "filmstrip", children: others.map((peer) => tileFor(peer, true)) })] }));
    }
    /* ---------------------------------------------------------- gallery */
    return _jsx(GalleryGrid, { count: allPeers.length, children: allPeers.map((peer) => tileFor(peer)) });
}
/**
 * Picks the column count that maximises tile area for the current aspect ratio,
 * the same way Zoom's gallery reflows as people join.
 */
function GalleryGrid({ count, children }) {
    const ref = useRef(null);
    const [columns, setColumns] = useState(1);
    useEffect(() => {
        const element = ref.current;
        if (!element)
            return;
        const recompute = () => {
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height || count === 0)
                return;
            let best = 1;
            let bestArea = 0;
            for (let cols = 1; cols <= count; cols++) {
                const rows = Math.ceil(count / cols);
                const gap = 10;
                const tileW = (width - gap * (cols - 1)) / cols;
                const tileH = (height - gap * (rows - 1)) / rows;
                // Tiles are 16:9; the binding dimension decides the usable area.
                const area = Math.min(tileW, tileH * (16 / 9)) ** 2;
                if (area > bestArea) {
                    bestArea = area;
                    best = cols;
                }
            }
            setColumns(best);
        };
        recompute();
        const observer = new ResizeObserver(recompute);
        observer.observe(element);
        return () => observer.disconnect();
    }, [count]);
    return (_jsx("div", { ref: ref, style: { width: '100%', height: '100%' }, children: _jsx("div", { className: "grid", style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }, children: children }) }));
}
function ScreenStage({ stream, peer, isLocal, onSizeChange, onVisibilityChange, }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    useEffect(() => {
        const video = videoRef.current;
        if (!video)
            return;
        if (video.srcObject !== stream)
            video.srcObject = stream;
        video.play().catch(() => undefined);
    }, [stream]);
    useEffect(() => {
        const element = containerRef.current;
        if (!element)
            return;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width)
                onSizeChange(Math.round(width * devicePixelRatio));
        });
        observer.observe(element);
        onVisibilityChange(true);
        return () => observer.disconnect();
    }, [onSizeChange, onVisibilityChange]);
    return (_jsxs("div", { className: "share-stage", ref: containerRef, children: [_jsxs("div", { className: "share-banner", children: [_jsx(ScreenShareIcon, { size: 15 }), isLocal ? 'You are sharing your screen' : `${peer.displayName} is sharing their screen`] }), _jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: true })] }));
}
//# sourceMappingURL=Stage.js.map