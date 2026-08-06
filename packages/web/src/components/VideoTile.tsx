import { useEffect, useRef, useState } from 'react';
import {
  colorForPeer,
  initialsFor,
  type MessageKey,
  type NetworkQuality,
  type PeerInfo,
  type ProducerSource,
} from '@meet/protocol';
import { HandIcon, MicOffIcon, PinIcon } from './icons';
import { useRoomStore } from '../store/roomStore';
import { useT } from '../i18n';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';

const QUALITY_KEYS: Record<NetworkQuality, MessageKey> = {
  excellent: 'quality.excellent',
  good: 'quality.good',
  poor: 'quality.poor',
  critical: 'quality.critical',
  disconnected: 'quality.disconnected',
};

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
export function VideoTile({
  peer,
  stream,
  source,
  isLocal = false,
  isSpeaking = false,
  audioLevel = 0,
  quality,
  pinned = false,
  onPin,
  compact = false,
}: VideoTileProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setRenderSize = useRoomStore((s) => s.setRenderSize);
  const client = useRoomStore((s) => s.client);
  const [hasVideo, setHasVideo] = useState(false);

  /* Attach the stream. Re-attaching an identical srcObject would restart playback. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!stream) {
      video.srcObject = null;
      setHasVideo(false);
      return;
    }

    if (video.srcObject !== stream) video.srcObject = stream;

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
    if (!video || isLocal) return;
    return webMediaAdapter.registerAudioElement(video);
  }, [isLocal]);

  /* Report rendered width so the SFU sends an appropriately sized layer. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element || isLocal) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setRenderSize(peer.id, source, Math.round(width * devicePixelRatio));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [peer.id, source, isLocal, setRenderSize]);

  /* Pause the consumer while the tile is off-screen. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element || isLocal || !client) return;

    const observer = new IntersectionObserver(
      ([entry]) => void client.setConsumerVisible(peer.id, source, entry.isIntersecting),
      { threshold: 0.05 },
    );
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

  return (
    <div
      ref={containerRef}
      className={`tile${isSpeaking ? ' speaking' : ''}${isLocal && source === 'webcam' ? ' mirrored' : ''}`}
      data-peer-id={peer.id}
    >
      <video ref={videoRef} autoPlay playsInline muted={isLocal} style={{ display: showVideo ? 'block' : 'none' }} />

      {!showVideo && (
        <div className="tile-avatar">
          <div
            className="avatar"
            style={{
              width: avatarSize,
              height: avatarSize,
              fontSize: avatarSize / 2.6,
              background: colorForPeer(peer.id),
            }}
          >
            {initials}
          </div>
        </div>
      )}

      <div className="tile-footer">
        <span className="tile-name">
          {!peer.audioEnabled && <MicOffIcon size={13} />}
          {peer.audioEnabled && (
            <span
              className="level-ring"
              style={{ transform: `scale(${0.5 + Math.min(1, audioLevel) * 0.75})` }}
              aria-hidden
            />
          )}
          {isLocal ? t('tile.self', { name: peer.displayName }) : peer.displayName}
          {source === 'screen' && t('tile.screenSuffix')}
        </span>
        {quality && quality !== 'excellent' && (
          <span
            className={`quality-dot quality-${quality}`}
            title={t('tile.connection', { quality: t(QUALITY_KEYS[quality]) })}
          />
        )}
      </div>

      <div className="tile-badges">
        {peer.handRaised && (
          <span className="pip" title={t('tile.handRaised')} style={{ color: '#ffd166' }}>
            <HandIcon size={14} />
          </span>
        )}
        {pinned && (
          <span className="pip" title={t('tile.pinned')}>
            <PinIcon size={13} />
          </span>
        )}
      </div>

      {!compact && onPin && (
        <div className="tile-actions">
          <button
            className="pip"
            onClick={onPin}
            title={pinned ? t('tile.unpin') : t('tile.pin')}
            aria-label={pinned ? t('tile.unpin') : t('tile.pin')}
          >
            <PinIcon size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
