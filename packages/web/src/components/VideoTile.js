import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { colorForPeer, initialsFor } from '@meet/protocol';
import { HandIcon, MicOffIcon, PinIcon } from './icons';
import { useRoomStore } from '../store/roomStore';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';
/**
 * One participant tile.
 *
 * Two behaviours matter for scale: the tile reports its rendered width so the
 * engine can request a matching simulcast layer, and it pauses its consumer when
 * scrolled out of view.
 */
export function VideoTile({ peer, stream, source, isLocal = false, isSpeaking = false, audioLevel = 0, quality, pinned = false, onPin, compact = false, }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const setRenderSize = useRoomStore((s) => s.setRenderSize);
    const client = useRoomStore((s) => s.client);
    const [hasVideo, setHasVideo] = useState(false);
    /* Attach the stream. Re-attaching an identical srcObject would restart playback. */
    useEffect(() => {
        const video = videoRef.current;
        if (!video)
            return;
        if (!stream) {
            video.srcObject = null;
            setHasVideo(false);
            return;
        }
        if (video.srcObject !== stream)
            video.srcObject = stream;
        const videoTracks = stream.getVideoTracks();
        setHasVideo(videoTracks.length > 0 && videoTracks[0].readyState === 'live');
        // Autoplay can be rejected before the user interacts with the page.
        const play = () => video.play().catch(() => undefined);
        play();
        const onAddTrack = () => setHasVideo(stream.getVideoTracks().length > 0);
        const onRemoveTrack = () => setHasVideo(stream.getVideoTracks().length > 0);
        stream.addEventListener('addtrack', onAddTrack);
        stream.addEventListener('removetrack', onRemoveTrack);
        return () => {
            stream.removeEventListener('addtrack', onAddTrack);
            stream.removeEventListener('removetrack', onRemoveTrack);
        };
    }, [stream]);
    /* Register for audio output routing (remote tiles only). */
    useEffect(() => {
        const video = videoRef.current;
        if (!video || isLocal)
            return;
        return webMediaAdapter.registerAudioElement(video);
    }, [isLocal]);
    /* Report rendered width so the SFU sends an appropriately sized layer. */
    useEffect(() => {
        const element = containerRef.current;
        if (!element || isLocal)
            return;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width)
                setRenderSize(peer.id, source, Math.round(width * devicePixelRatio));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [peer.id, source, isLocal, setRenderSize]);
    /* Pause the consumer while the tile is off-screen. */
    useEffect(() => {
        const element = containerRef.current;
        if (!element || isLocal || !client)
            return;
        const observer = new IntersectionObserver(([entry]) => void client.setConsumerVisible(peer.id, source, entry.isIntersecting), { threshold: 0.05 });
        observer.observe(element);
        return () => {
            observer.disconnect();
            void client.setConsumerVisible(peer.id, source, true);
        };
    }, [peer.id, source, isLocal, client]);
    // A live video track is not enough on its own: a remote peer's camera producer
    // can be paused, in which case the last frame would otherwise freeze on screen.
    const showVideo = hasVideo && (source === 'screen' || isLocal || peer.videoEnabled);
    const initials = initialsFor(peer.displayName);
    const avatarSize = compact ? 40 : 84;
    return (_jsxs("div", { ref: containerRef, className: `tile${isSpeaking ? ' speaking' : ''}${isLocal && source === 'webcam' ? ' mirrored' : ''}`, "data-peer-id": peer.id, children: [_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: isLocal, style: { display: showVideo ? 'block' : 'none' } }), !showVideo && (_jsx("div", { className: "tile-avatar", children: _jsx("div", { className: "avatar", style: {
                        width: avatarSize,
                        height: avatarSize,
                        fontSize: avatarSize / 2.6,
                        background: colorForPeer(peer.id),
                    }, children: initials }) })), _jsxs("div", { className: "tile-footer", children: [_jsxs("span", { className: "tile-name", children: [!peer.audioEnabled && _jsx(MicOffIcon, { size: 13 }), peer.audioEnabled && (_jsx("span", { className: "level-ring", style: { transform: `scale(${0.5 + Math.min(1, audioLevel) * 0.75})` }, "aria-hidden": true })), isLocal ? `${peer.displayName} (you)` : peer.displayName, source === 'screen' && ' — screen'] }), quality && quality !== 'excellent' && _jsx("span", { className: `quality-dot quality-${quality}`, title: `Connection: ${quality}` })] }), _jsxs("div", { className: "tile-badges", children: [peer.handRaised && (_jsx("span", { className: "pip", title: "Hand raised", style: { color: '#ffd166' }, children: _jsx(HandIcon, { size: 14 }) })), pinned && (_jsx("span", { className: "pip", title: "Pinned", children: _jsx(PinIcon, { size: 13 }) }))] }), !compact && onPin && (_jsx("div", { className: "tile-actions", children: _jsx("button", { className: "pip", onClick: onPin, title: pinned ? 'Unpin' : 'Pin to main view', "aria-label": pinned ? 'Unpin' : 'Pin', children: _jsx(PinIcon, { size: 13 }) }) }))] }));
}
//# sourceMappingURL=VideoTile.js.map