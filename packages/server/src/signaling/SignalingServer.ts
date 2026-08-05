import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { ErrorCodes, ProtocolError, type ClientRequestMethod, type ClientRequests } from '@meet/protocol';
import { config } from '../config.js';
import { childLogger } from '../logger.js';
import { verifyJoinToken } from '../auth.js';
import { roomManager } from '../room/RoomManager.js';
import type { Room } from '../room/Room.js';
import type { Peer } from '../room/Peer.js';
import { Connection } from './Connection.js';

const log = childLogger('signaling');

const deviceSchema = z.object({
  name: z.string().max(64),
  version: z.string().max(32).optional(),
  platform: z.enum(['web', 'android', 'ios', 'unknown']),
});

const schemas = {
  getRouterRtpCapabilities: z.object({}).passthrough(),
  join: z.object({
    displayName: z.string().min(1).max(64),
    device: deviceSchema,
    rtpCapabilities: z.any(),
    sctpCapabilities: z.any().optional(),
  }),
  createWebRtcTransport: z.object({
    producing: z.boolean(),
    consuming: z.boolean(),
    sctpCapabilities: z.any().optional(),
    forceTcp: z.boolean().optional(),
  }),
  connectWebRtcTransport: z.object({ transportId: z.string(), dtlsParameters: z.any() }),
  restartIce: z.object({ transportId: z.string() }),
  produce: z.object({
    transportId: z.string(),
    kind: z.enum(['audio', 'video']),
    rtpParameters: z.any(),
    appData: z.object({ source: z.enum(['mic', 'webcam', 'screen', 'screen-audio']) }).passthrough(),
  }),
  closeProducer: z.object({ producerId: z.string() }),
  pauseProducer: z.object({ producerId: z.string() }),
  resumeProducer: z.object({ producerId: z.string() }),
  pauseConsumer: z.object({ consumerId: z.string() }),
  resumeConsumer: z.object({ consumerId: z.string() }),
  setConsumerPreferredLayers: z.object({
    consumerId: z.string(),
    spatialLayer: z.number().int().min(0).max(4),
    temporalLayer: z.number().int().min(0).max(4),
  }),
  setConsumerPriority: z.object({ consumerId: z.string(), priority: z.number().int().min(1).max(255) }),
  requestConsumerKeyFrame: z.object({ consumerId: z.string() }),
  getTransportStats: z.object({ transportId: z.string() }),
  getProducerStats: z.object({ producerId: z.string() }),
  getConsumerStats: z.object({ consumerId: z.string() }),
  setDisplayName: z.object({ displayName: z.string().min(1).max(64) }),
  raiseHand: z.object({ raised: z.boolean() }),
  sendReaction: z.object({ emoji: z.string().min(1).max(8) }),
  sendChatMessage: z.object({ text: z.string().min(1).max(4000), to: z.string().optional() }),
  muteParticipant: z.object({ peerId: z.string() }),
  muteAll: z.object({ allowUnmute: z.boolean() }),
  stopParticipantVideo: z.object({ peerId: z.string() }),
  stopParticipantShare: z.object({ peerId: z.string() }),
  removeParticipant: z.object({ peerId: z.string() }),
  setPeerRole: z.object({ peerId: z.string(), role: z.enum(['host', 'co-host', 'participant']) }),
  setRoomSettings: z.object({
    locked: z.boolean().optional(),
    lobbyEnabled: z.boolean().optional(),
    allowUnmute: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
    allowChat: z.boolean().optional(),
  }),
  admitLobbyPeer: z.object({ peerId: z.string(), admit: z.boolean() }),
  endMeeting: z.object({}).passthrough(),
  startRecording: z.object({}).passthrough(),
  stopRecording: z.object({}).passthrough(),
} satisfies Record<ClientRequestMethod, z.ZodTypeAny>;

interface Session {
  connection: Connection;
  room: Room;
  peer: Peer;
}

export class SignalingServer {
  private wss?: WebSocketServer;
  private readonly sessions = new Map<string, Session>();

  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      // Per-message deflate costs more CPU than it saves on small JSON frames.
      perMessageDeflate: false,
      maxPayload: 1024 * 1024,
    });

    this.wss.on('connection', (socket, request) => {
      void this.onConnection(socket, request.url ?? '', request.headers['user-agent'] ?? '');
    });

    this.wss.on('error', (error) => log.error({ err: error }, 'websocket server error'));
    log.info('signaling server attached at /ws');
  }

  private async onConnection(socket: WebSocket, url: string, userAgent: string): Promise<void> {
    const params = new URL(url, 'http://localhost').searchParams;
    const roomId = params.get('roomId');
    const displayName = (params.get('displayName') ?? 'Guest').slice(0, 64);
    const token = params.get('token');
    const peerId = params.get('peerId') || nanoid(16);

    if (!roomId) {
      socket.close(4400, 'roomId is required');
      return;
    }

    // A token is only required when the room was created with a passcode.
    const requiredPasscode = roomManager.passcodeFor(roomId);
    if (requiredPasscode) {
      const claims = token ? verifyJoinToken(token) : null;
      if (!claims || claims.roomId !== roomId) {
        socket.close(4401, 'invalid or missing token');
        return;
      }
    }

    const connection = new Connection(socket, peerId);

    // Clients fire `getRouterRtpCapabilities` the moment the socket opens, which
    // can beat the `await` below (opening a room creates a mediasoup router).
    // Register the dispatcher immediately and have it park on the session promise
    // so no early request is ever answered with "no request handler registered".
    let markReady: (session: Session) => void = () => undefined;
    let markFailed: (error: Error) => void = () => undefined;
    const sessionReady = new Promise<Session>((resolve, reject) => {
      markReady = resolve;
      markFailed = reject;
    });
    // Nothing awaits this promise on the failure path; keep Node quiet about it.
    sessionReady.catch(() => undefined);

    connection.onRequest(async (method, data) => {
      const session = await sessionReady;
      return this.handleRequest(session, method as ClientRequestMethod, data);
    });

    let room: Room;
    try {
      room = await roomManager.getOrCreate(roomId);
    } catch (error) {
      log.warn({ err: error, roomId }, 'failed to open room');
      const message = error instanceof Error ? error.message : 'failed to open meeting';
      markFailed(new ProtocolError(error instanceof ProtocolError ? error.code : ErrorCodes.INTERNAL, message));
      connection.notify('serverError', {
        code: error instanceof ProtocolError ? error.code : ErrorCodes.INTERNAL,
        message,
      });
      connection.close(4500, 'room error');
      return;
    }

    if (room.peerCount >= config.room.maxPeers) {
      markFailed(new ProtocolError(ErrorCodes.ROOM_FULL, 'This meeting is full.'));
      connection.notify('serverError', { code: ErrorCodes.ROOM_FULL, message: 'This meeting is full.' });
      connection.close(4503, 'room full');
      return;
    }

    let peer: Peer;
    try {
      peer = room.createPeer(peerId, displayName, connection);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'could not join';
      markFailed(new ProtocolError(ErrorCodes.ALREADY_JOINED, message));
      connection.notify('serverError', { code: ErrorCodes.ALREADY_JOINED, message });
      connection.close(4409, 'duplicate peer');
      return;
    }

    peer.device = { name: shortUserAgent(userAgent), platform: /android/i.test(userAgent) ? 'android' : 'web' };

    const session: Session = { connection, room, peer };
    this.sessions.set(peerId, session);

    // A peer that opens a socket and never joins is a resource leak; cut it loose.
    const joinTimer = setTimeout(() => {
      if (!peer.joined && !room.isInLobby(peer.id)) {
        log.info({ peerId }, 'join timeout');
        connection.close(4408, 'join timeout');
      }
    }, config.room.joinTimeoutMs);

    connection.on('close', () => {
      clearTimeout(joinTimer);
      markFailed(new ProtocolError(ErrorCodes.INTERNAL, 'connection closed'));
      this.sessions.delete(peerId);
      room.removePeer(peerId);
    });

    // Releases any requests that arrived while the room was being created.
    markReady(session);

    log.info({ peerId, roomId, displayName }, 'socket connected');
  }

  private async handleRequest(session: Session, method: ClientRequestMethod, rawData: unknown): Promise<unknown> {
    const { peer, room, connection } = session;

    const schema = schemas[method];
    if (!schema) throw new ProtocolError(ErrorCodes.BAD_REQUEST, `unknown method "${method}"`);

    const parsed = schema.safeParse(rawData ?? {});
    if (!parsed.success) {
      throw new ProtocolError(ErrorCodes.BAD_REQUEST, `invalid payload for "${method}": ${parsed.error.issues[0]?.message}`);
    }
    const data = parsed.data as never;

    // Everything except the handshake pair requires a completed join.
    if (method !== 'getRouterRtpCapabilities' && method !== 'join' && !peer.joined) {
      throw new ProtocolError(ErrorCodes.NOT_JOINED, 'you must join the meeting first');
    }

    switch (method) {
      case 'getRouterRtpCapabilities':
        return { rtpCapabilities: room.rtpCapabilities };

      case 'join': {
        const payload = data as ClientRequests['join']['request'];
        peer.device = payload.device;
        if (room.info.lobbyEnabled && !peer.isModerator) {
          peer.displayName = payload.displayName;
          peer.rtpCapabilities = payload.rtpCapabilities;
          room.addToLobby(peer);
          return { status: 'lobby' as const };
        }
        return room.join(peer, payload);
      }

      case 'createWebRtcTransport':
        return room.createWebRtcTransport(peer, data);

      case 'connectWebRtcTransport':
        await room.connectWebRtcTransport(peer, data);
        return {};

      case 'restartIce':
        return room.restartIce(peer, data);

      case 'produce':
        return room.produce(peer, data);

      case 'closeProducer':
        await room.closeProducer(peer, (data as { producerId: string }).producerId);
        return {};

      case 'pauseProducer':
        await room.setProducerPaused(peer, (data as { producerId: string }).producerId, true);
        return {};

      case 'resumeProducer':
        await room.setProducerPaused(peer, (data as { producerId: string }).producerId, false);
        return {};

      case 'pauseConsumer':
        await room.setConsumerPaused(peer, (data as { consumerId: string }).consumerId, true);
        return {};

      case 'resumeConsumer':
        await room.setConsumerPaused(peer, (data as { consumerId: string }).consumerId, false);
        return {};

      case 'setConsumerPreferredLayers':
        await room.setConsumerPreferredLayers(peer, data);
        return {};

      case 'setConsumerPriority': {
        const { consumerId, priority } = data as { consumerId: string; priority: number };
        await room.setConsumerPriority(peer, consumerId, priority);
        return {};
      }

      case 'requestConsumerKeyFrame':
        await room.requestConsumerKeyFrame(peer, (data as { consumerId: string }).consumerId);
        return {};

      case 'getTransportStats':
        return { stats: await room.getStats(peer, 'transport', (data as { transportId: string }).transportId) };

      case 'getProducerStats':
        return { stats: await room.getStats(peer, 'producer', (data as { producerId: string }).producerId) };

      case 'getConsumerStats':
        return { stats: await room.getStats(peer, 'consumer', (data as { consumerId: string }).consumerId) };

      case 'setDisplayName':
        room.setDisplayName(peer, (data as { displayName: string }).displayName);
        return {};

      case 'raiseHand':
        room.setHandRaised(peer, (data as { raised: boolean }).raised);
        return {};

      case 'sendReaction':
        room.sendReaction(peer, (data as { emoji: string }).emoji);
        return {};

      case 'sendChatMessage': {
        const { text, to } = data as { text: string; to?: string };
        return { message: room.addChatMessage(peer, text, to) };
      }

      case 'muteParticipant':
        await room.muteParticipant(peer, (data as { peerId: string }).peerId);
        return {};

      case 'muteAll':
        await room.muteAll(peer, (data as { allowUnmute: boolean }).allowUnmute);
        return {};

      case 'stopParticipantVideo':
        await room.stopParticipantVideo(peer, (data as { peerId: string }).peerId);
        return {};

      case 'stopParticipantShare':
        await room.stopParticipantShare(peer, (data as { peerId: string }).peerId);
        return {};

      case 'removeParticipant':
        room.removeParticipant(peer, (data as { peerId: string }).peerId);
        return {};

      case 'setPeerRole': {
        const { peerId, role } = data as { peerId: string; role: 'host' | 'co-host' | 'participant' };
        room.setPeerRole(peer, peerId, role);
        return {};
      }

      case 'setRoomSettings':
        return { room: room.updateSettings(peer, data) };

      case 'admitLobbyPeer': {
        const { peerId, admit } = data as { peerId: string; admit: boolean };
        if (!peer.isModerator) throw new ProtocolError(ErrorCodes.FORBIDDEN, 'host privileges required');
        room.admitFromLobby(peerId, admit);
        return {};
      }

      case 'endMeeting':
        room.endMeeting(peer);
        return {};

      case 'startRecording':
        return room.startRecording(peer);

      case 'stopRecording':
        await room.stopRecording(peer);
        return {};

      default: {
        // Exhaustiveness guard: adding a protocol method without a handler fails to compile.
        const never: never = method;
        void connection;
        throw new ProtocolError(ErrorCodes.BAD_REQUEST, `unhandled method ${String(never)}`);
      }
    }
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  close(): void {
    for (const { connection } of this.sessions.values()) {
      connection.close(1001, 'server shutting down');
    }
    this.sessions.clear();
    this.wss?.close();
  }
}

function shortUserAgent(ua: string): string {
  if (/MeetAndroid/i.test(ua)) return 'Meet Android';
  if (/Android/i.test(ua)) return 'Android';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Browser';
}

export const signalingServer = new SignalingServer();
