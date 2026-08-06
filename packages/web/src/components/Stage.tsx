import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PeerInfo } from '@meet/protocol';
import type { RoomClient, RoomState } from '@meet/client-core';
import { VideoTile } from './VideoTile';
import { useRoomStore } from '../store/roomStore';
import { ScreenShareIcon } from './icons';

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
export function Stage({ client, room }: StageProps) {
  const layout = useRoomStore((s) => s.layout);
  const pinnedPeerId = useRoomStore((s) => s.pinnedPeerId);
  const pinPeer = useRoomStore((s) => s.pinPeer);

  const self = room.self;
  const allPeers = useMemo<PeerInfo[]>(() => {
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

  const streamFor = (peer: PeerInfo): MediaStream | undefined =>
    self && peer.id === self.id ? client.getLocalStream('webcam') : client.getStream(peer.id, 'webcam');

  const tileFor = (peer: PeerInfo, compact = false) => (
    <VideoTile
      key={peer.id}
      peer={peer}
      source="webcam"
      stream={streamFor(peer)}
      isLocal={Boolean(self && peer.id === self.id)}
      isSpeaking={room.activeSpeakerId === peer.id}
      audioLevel={room.audioLevels.get(peer.id) ?? 0}
      quality={self && peer.id === self.id ? room.quality : client.qualityForPeer(peer.id)}
      pinned={pinnedPeerId === peer.id}
      onPin={compact ? undefined : () => pinPeer(pinnedPeerId === peer.id ? null : peer.id)}
      compact={compact}
    />
  );

  /* --------------------------------------------------------- screen share */

  if (sharingPeerId && screenStream && sharingPeer) {
    const others = allPeers.filter((p) => p.id !== sharingPeerId);
    return (
      <div className={`share-layout${others.length === 0 ? ' no-strip' : ''}`}>
        <ScreenStage
          stream={screenStream}
          peer={sharingPeer}
          isLocal={isSharingLocally}
          onSizeChange={(width) => {
            if (!isSharingLocally) client.setRenderSize(sharingPeerId, 'screen', width);
          }}
          onVisibilityChange={(visible) => {
            if (!isSharingLocally) void client.setConsumerVisible(sharingPeerId, 'screen', visible);
          }}
        />
        {others.length > 0 && (
          <div className="filmstrip">
            {tileFor(sharingPeer, true)}
            {others.map((peer) => tileFor(peer, true))}
          </div>
        )}
      </div>
    );
  }

  /* --------------------------------------------------- pinned / speaker */

  const focusId = pinnedPeerId ?? (layout === 'speaker' ? (room.activeSpeakerId ?? allPeers[0]?.id) : null);

  if (focusId && allPeers.length > 1) {
    const focused = allPeers.find((p) => p.id === focusId) ?? allPeers[0];
    const others = allPeers.filter((p) => p.id !== focused.id);
    return (
      <div className="share-layout">
        <div className="share-stage">{tileFor(focused)}</div>
        <div className="filmstrip">{others.map((peer) => tileFor(peer, true))}</div>
      </div>
    );
  }

  /* ---------------------------------------------------------- gallery */

  return <GalleryGrid count={allPeers.length}>{allPeers.map((peer) => tileFor(peer))}</GalleryGrid>;
}

const GRID_GAP = 10;
const TILE_ASPECT = 16 / 9;

/**
 * Picks the tile arrangement that maximises tile area, the way Zoom's gallery
 * reflows as people join.
 *
 * Both track dimensions are resolved here and written as explicit pixel sizes.
 * Letting CSS derive row height from `aspect-ratio` on the column width looks
 * right until the rows no longer fit: nothing in that model is aware of the
 * container's height, so the grid silently overflows and `.stage`'s
 * `overflow: hidden` guillotines the bottom row. Sizing both axes from the
 * measured box makes overflow impossible by construction.
 */
function GalleryGrid({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, tileWidth: 0, tileHeight: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height || count === 0) return;

      let best = { columns: 1, tileWidth: 0, tileHeight: 0 };
      for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - GRID_GAP * (columns - 1)) / columns;
        const cellHeight = (height - GRID_GAP * (rows - 1)) / rows;
        if (cellWidth <= 0 || cellHeight <= 0) continue;

        // The largest 16:9 tile that fits this cell on *both* axes.
        const tileWidth = Math.min(cellWidth, cellHeight * TILE_ASPECT);
        const tileHeight = tileWidth / TILE_ASPECT;
        if (tileWidth * tileHeight > best.tileWidth * best.tileHeight) {
          best = { columns, tileWidth, tileHeight };
        }
      }
      if (best.tileWidth <= 0) return;

      // Only commit a real change: re-rendering into an identical layout would
      // resize tiles, which feeds the observers below straight back into here.
      setLayout((previous) =>
        previous.columns === best.columns &&
        Math.abs(previous.tileWidth - best.tileWidth) < 0.5 &&
        Math.abs(previous.tileHeight - best.tileHeight) < 0.5
          ? previous
          : best,
      );
    };

    // Deferred to the next frame so geometry is read after layout settles, and
    // so a burst of resize events collapses into a single measurement. It also
    // keeps the work out of the ResizeObserver callback itself: resizing tiles
    // from inside that callback trips Chrome's loop guard, and once tripped it
    // silently stops delivering notifications — which is exactly how the grid
    // ended up holding pixel tracks measured at a stale viewport size.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    // Belt and braces: a dropped observer notification must not leave the grid
    // permanently mis-sized, and window resize is the case users actually hit.
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [count]);

  // Only the column count comes from JS. Row height is `minmax(0, 1fr)` in CSS,
  // so however many rows there are they divide the container's height between
  // them. That is what makes overflow structurally impossible: if this
  // measurement is ever stale — a dropped ResizeObserver notification, a resize
  // during a background tab — the tiles come out at a non-ideal aspect ratio
  // instead of being clipped off the bottom of the stage.
  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  );
}

function ScreenStage({
  stream,
  peer,
  isLocal,
  onSizeChange,
  onVisibilityChange,
}: {
  stream: MediaStream;
  peer: PeerInfo;
  isLocal: boolean;
  onSizeChange: (width: number) => void;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) onSizeChange(Math.round(width * devicePixelRatio));
    });
    observer.observe(element);
    onVisibilityChange(true);
    return () => observer.disconnect();
  }, [onSizeChange, onVisibilityChange]);

  return (
    <div className="share-stage" ref={containerRef}>
      <div className="share-banner">
        <ScreenShareIcon size={15} />
        {isLocal ? 'You are sharing your screen' : `${peer.displayName} is sharing their screen`}
      </div>
      {/* Muted: screen audio is played by AudioRenderer so it survives layout changes. */}
      <video ref={videoRef} autoPlay playsInline muted />
    </div>
  );
}
