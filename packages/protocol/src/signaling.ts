/**
 * Wire protocol between clients and the SFU.
 *
 * Transport is a single WebSocket per peer carrying newline-free JSON frames.
 * There are exactly three frame shapes: `request`, `response`, `notification`.
 * Requests are bidirectional — the server issues `newConsumer` as a request so it
 * knows the client has created the receiving transport-side consumer before it
 * resumes the stream (this is what prevents the classic "black first frame" race).
 */

import type {
  ChatMessage,
  ConsumerLayers,
  DeviceInfo,
  LobbyPeer,
  MediaKind,
  NewConsumerPayload,
  PeerInfo,
  PeerRole,
  ProducerAppData,
  Reaction,
  RoomInfo,
  RtpCapabilities,
  RtpParameters,
  DtlsParameters,
  SctpCapabilities,
  TransportOptions,
} from './types.js';

export const PROTOCOL_VERSION = 1;

/* ------------------------------------------------------------------ frames */

export interface RequestFrame<M extends string = string, D = unknown> {
  type: 'request';
  id: number;
  method: M;
  data: D;
}

export interface ResponseFrame<D = unknown> {
  type: 'response';
  id: number;
  ok: boolean;
  data?: D;
  error?: { code: string; message: string };
}

export interface NotificationFrame<M extends string = string, D = unknown> {
  type: 'notification';
  method: M;
  data: D;
}

export type Frame = RequestFrame | ResponseFrame | NotificationFrame;

/* --------------------------------------------------- client -> server API */

export interface ClientRequests {
  /** Handshake. Must be the first request. */
  getRouterRtpCapabilities: {
    request: Record<string, never>;
    response: { rtpCapabilities: RtpCapabilities };
  };

  /** Enter the room (or the lobby, if the room requires admission). */
  join: {
    request: {
      displayName: string;
      device: DeviceInfo;
      rtpCapabilities: RtpCapabilities;
      sctpCapabilities?: SctpCapabilities;
    };
    response:
      | { status: 'joined'; peers: PeerInfo[]; room: RoomInfo; self: PeerInfo; chatHistory: ChatMessage[] }
      | { status: 'lobby' };
  };

  createWebRtcTransport: {
    request: {
      producing: boolean;
      consuming: boolean;
      sctpCapabilities?: SctpCapabilities;
      /** Client asks for TCP-only candidates when it detected a restrictive network. */
      forceTcp?: boolean;
    };
    response: TransportOptions;
  };

  connectWebRtcTransport: {
    request: { transportId: string; dtlsParameters: DtlsParameters };
    response: Record<string, never>;
  };

  restartIce: {
    request: { transportId: string };
    response: { iceParameters: unknown };
  };

  produce: {
    request: {
      transportId: string;
      kind: MediaKind;
      rtpParameters: RtpParameters;
      appData: ProducerAppData;
    };
    response: { id: string };
  };

  closeProducer: { request: { producerId: string }; response: Record<string, never> };
  pauseProducer: { request: { producerId: string }; response: Record<string, never> };
  resumeProducer: { request: { producerId: string }; response: Record<string, never> };

  pauseConsumer: { request: { consumerId: string }; response: Record<string, never> };
  resumeConsumer: { request: { consumerId: string }; response: Record<string, never> };

  /** Adapt the received simulcast/SVC layer to the rendered tile size. */
  setConsumerPreferredLayers: {
    request: { consumerId: string } & ConsumerLayers;
    response: Record<string, never>;
  };
  setConsumerPriority: {
    request: { consumerId: string; priority: number };
    response: Record<string, never>;
  };
  requestConsumerKeyFrame: {
    request: { consumerId: string };
    response: Record<string, never>;
  };

  getTransportStats: { request: { transportId: string }; response: { stats: unknown } };
  getProducerStats: { request: { producerId: string }; response: { stats: unknown } };
  getConsumerStats: { request: { consumerId: string }; response: { stats: unknown } };

  /* ------------------------------------------------------------ room ops */

  setDisplayName: { request: { displayName: string }; response: Record<string, never> };
  raiseHand: { request: { raised: boolean }; response: Record<string, never> };
  sendReaction: { request: { emoji: string }; response: Record<string, never> };
  sendChatMessage: { request: { text: string; to?: string }; response: { message: ChatMessage } };

  /* ------------------------------------------------------ moderation ops */

  muteParticipant: { request: { peerId: string }; response: Record<string, never> };
  muteAll: { request: { allowUnmute: boolean }; response: Record<string, never> };
  stopParticipantVideo: { request: { peerId: string }; response: Record<string, never> };
  stopParticipantShare: { request: { peerId: string }; response: Record<string, never> };
  removeParticipant: { request: { peerId: string }; response: Record<string, never> };
  setPeerRole: { request: { peerId: string; role: PeerRole }; response: Record<string, never> };
  setRoomSettings: {
    request: Partial<Pick<RoomInfo, 'locked' | 'lobbyEnabled' | 'allowUnmute' | 'allowScreenShare' | 'allowChat'>>;
    response: { room: RoomInfo };
  };
  admitLobbyPeer: { request: { peerId: string; admit: boolean }; response: Record<string, never> };
  endMeeting: { request: Record<string, never>; response: Record<string, never> };

  startRecording: { request: Record<string, never>; response: { recordingId: string } };
  stopRecording: { request: Record<string, never>; response: Record<string, never> };
}

export type ClientRequestMethod = keyof ClientRequests;

/* --------------------------------------------------- server -> client API */

export interface ServerRequests {
  /**
   * Sent when a remote producer becomes available. The client must create the
   * consumer and reply before the server resumes it.
   */
  newConsumer: { request: NewConsumerPayload; response: Record<string, never> };
}

export type ServerRequestMethod = keyof ServerRequests;

/* --------------------------------------- server -> client notifications */

export interface ServerNotifications {
  newPeer: PeerInfo;
  peerClosed: { peerId: string };
  peerUpdated: { peerId: string } & Partial<PeerInfo>;

  consumerClosed: { consumerId: string };
  consumerPaused: { consumerId: string };
  consumerResumed: { consumerId: string };
  consumerLayersChanged: { consumerId: string; spatialLayer: number | null; temporalLayer: number | null };
  consumerScore: { consumerId: string; score: { score: number; producerScore: number } };
  producerScore: { producerId: string; score: unknown };

  /** Loudest speaker in the room, or null when the room fell silent. */
  activeSpeaker: { peerId: string | null; volume?: number };
  /** Continuous per-peer audio levels for the mic indicator ring. */
  audioLevels: { levels: Array<{ peerId: string; volume: number }> };

  chatMessage: ChatMessage;
  reaction: Reaction;

  roomUpdated: RoomInfo;
  lobbyUpdated: { peers: LobbyPeer[] };
  /** Server admitted us out of the lobby — the client should now run the join flow. */
  lobbyAdmitted: Record<string, never>;
  lobbyDenied: { reason: string };

  /** A host muted us / stopped our video / stopped our share. */
  moderatorAction: {
    action: 'mute' | 'stopVideo' | 'stopShare' | 'unmuteRequest';
    byPeerId: string;
    byDisplayName: string;
  };

  recordingStateChanged: { recording: boolean; startedBy?: string };

  /** Terminal notifications — the socket closes right after. */
  removedFromRoom: { reason: string };
  meetingEnded: { reason: string };

  /** Fatal or recoverable transport error surfaced for UX. */
  serverError: { code: string; message: string };
}

export type ServerNotificationMethod = keyof ServerNotifications;

/* ------------------------------------------------------------ error codes */

export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_LOCKED: 'ROOM_LOCKED',
  ALREADY_JOINED: 'ALREADY_JOINED',
  NOT_JOINED: 'NOT_JOINED',
  INTERNAL: 'INTERNAL',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED: 'UNSUPPORTED',
  SCREEN_SHARE_BUSY: 'SCREEN_SHARE_BUSY',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ProtocolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}
