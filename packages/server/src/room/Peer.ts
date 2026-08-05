import type { types as ms } from 'mediasoup';
import type { DeviceInfo, PeerInfo, PeerRole, ProducerSource, RtpCapabilities } from '@meet/protocol';
import type { Connection } from '../signaling/Connection.js';

/**
 * One participant's server-side media state.
 *
 * A peer owns at most two WebRTC transports (one send, one receive) which carry
 * every track. Producers are keyed by their product-level source so the room can
 * answer questions like "is this peer sharing their screen" without walking maps.
 */
export class Peer {
  readonly id: string;
  readonly connection: Connection;
  readonly joinedAt = Date.now();

  displayName: string;
  role: PeerRole = 'participant';
  device: DeviceInfo = { name: 'unknown', platform: 'unknown' };
  rtpCapabilities: RtpCapabilities | undefined;

  /** True once the `join` request completed successfully. */
  joined = false;
  /**
   * Set when a host admits this peer out of the waiting room.
   *
   * The client re-runs the join handshake after admission, so without this the
   * lobby check would match a second time and bounce them straight back — an
   * admitted guest could never actually get in.
   */
  admittedFromLobby = false;
  handRaised = false;
  /** Set by the host's "mute all + don't allow unmute" control. */
  unmuteBlocked = false;

  readonly transports = new Map<string, ms.WebRtcTransport>();
  readonly producers = new Map<string, ms.Producer>();
  readonly consumers = new Map<string, ms.Consumer>();
  readonly dataProducers = new Map<string, ms.DataProducer>();
  readonly dataConsumers = new Map<string, ms.DataConsumer>();

  /** Latest transport score, surfaced as the connection quality pip. */
  connectionScore = 10;

  private closed = false;

  constructor(id: string, displayName: string, connection: Connection) {
    this.id = id;
    this.displayName = displayName;
    this.connection = connection;
  }

  get sendTransport(): ms.WebRtcTransport | undefined {
    return [...this.transports.values()].find((t) => t.appData.producing === true);
  }

  get recvTransport(): ms.WebRtcTransport | undefined {
    return [...this.transports.values()].find((t) => t.appData.consuming === true);
  }

  producerBySource(source: ProducerSource): ms.Producer | undefined {
    return [...this.producers.values()].find((p) => (p.appData as { source?: string }).source === source);
  }

  get audioEnabled(): boolean {
    const mic = this.producerBySource('mic');
    return Boolean(mic && !mic.closed && !mic.paused);
  }

  get videoEnabled(): boolean {
    const cam = this.producerBySource('webcam');
    return Boolean(cam && !cam.closed && !cam.paused);
  }

  get screenSharing(): boolean {
    const screen = this.producerBySource('screen');
    return Boolean(screen && !screen.closed);
  }

  get isModerator(): boolean {
    return this.role === 'host' || this.role === 'co-host';
  }

  toInfo(): PeerInfo {
    return {
      id: this.id,
      displayName: this.displayName,
      role: this.role,
      device: this.device,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      screenSharing: this.screenSharing,
      handRaised: this.handRaised,
      joinedAt: this.joinedAt,
      connectionScore: this.connectionScore,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Closing a transport cascades to its producers, consumers and data channels,
    // so this is the only teardown that has to be explicit.
    for (const transport of this.transports.values()) {
      try {
        transport.close();
      } catch {
        /* already closed */
      }
    }
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.dataProducers.clear();
    this.dataConsumers.clear();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
