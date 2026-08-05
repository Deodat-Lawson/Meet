/**
 * Core domain types shared by the SFU server, the web client and the mobile client.
 *
 * These types intentionally avoid importing from `mediasoup` or `mediasoup-client`
 * so that the protocol package stays dependency-free and can be consumed by
 * React Native (where the native mediasoup-client handler is used) as well as by
 * the Node server.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Opaque mediasoup structures. Both peers cast these to their local mediasoup types. */
export type RtpCapabilities = any;
export type RtpParameters = any;
export type DtlsParameters = any;
export type IceParameters = any;
export type IceCandidate = any;
export type SctpParameters = any;
export type SctpCapabilities = any;

export type MediaKind = 'audio' | 'video';

/** What a producer represents in product terms. Drives UI layout and SFU policy. */
export type ProducerSource = 'mic' | 'webcam' | 'screen' | 'screen-audio';

export type PeerRole = 'host' | 'co-host' | 'participant';

export interface DeviceInfo {
  /** e.g. "Chrome", "Firefox", "Android" */
  name: string;
  version?: string;
  /** "web" | "android" | "ios" */
  platform: ClientPlatform;
}

export type ClientPlatform = 'web' | 'android' | 'ios' | 'unknown';

/** Public projection of a peer, broadcast to everyone in the room. */
export interface PeerInfo {
  id: string;
  displayName: string;
  role: PeerRole;
  device: DeviceInfo;
  /** Whether the peer currently has an unmuted mic producer. */
  audioEnabled: boolean;
  /** Whether the peer currently has an active webcam producer. */
  videoEnabled: boolean;
  /** Whether the peer is currently sharing their screen. */
  screenSharing: boolean;
  handRaised: boolean;
  joinedAt: number;
  /** 0..10 connection quality score derived from mediasoup transport/producer scores. */
  connectionScore?: number;
}

export interface RoomInfo {
  id: string;
  /** Human friendly name, e.g. "Weekly standup". */
  name: string;
  locked: boolean;
  /** Lobby (waiting-room) enabled. */
  lobbyEnabled: boolean;
  recording: boolean;
  /** Everyone joins muted and cannot unmute themselves without host permission. */
  allowUnmute: boolean;
  /** Whether non-hosts may share their screen. */
  allowScreenShare: boolean;
  /** Whether non-hosts may send chat. */
  allowChat: boolean;
  createdAt: number;
  maxPeers: number;
}

export interface ChatMessage {
  id: string;
  peerId: string;
  displayName: string;
  text: string;
  timestamp: number;
  /** Undefined = to everyone; otherwise a peerId for a direct message. */
  to?: string;
}

export interface Reaction {
  peerId: string;
  displayName: string;
  emoji: string;
  timestamp: number;
}

export interface LobbyPeer {
  id: string;
  displayName: string;
  device: DeviceInfo;
  requestedAt: number;
}

export interface ConsumerLayers {
  spatialLayer: number;
  temporalLayer: number;
}

/** Data sent with `newConsumer` so the client can construct a mediasoup Consumer. */
export interface NewConsumerPayload {
  peerId: string;
  producerId: string;
  id: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
  type: string;
  appData: ProducerAppData;
  producerPaused: boolean;
}

export interface ProducerAppData {
  source: ProducerSource;
  [key: string]: unknown;
}

export interface TransportOptions {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
  sctpParameters?: SctpParameters;
  iceServers?: IceServer[];
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Network quality bucket surfaced in the UI. */
export type NetworkQuality = 'excellent' | 'good' | 'poor' | 'critical' | 'disconnected';

export interface PeerStats {
  peerId: string;
  /** Round trip time in ms, when available. */
  rtt?: number;
  /** 0..1 */
  packetLoss?: number;
  availableOutgoingBitrate?: number;
  quality: NetworkQuality;
}
