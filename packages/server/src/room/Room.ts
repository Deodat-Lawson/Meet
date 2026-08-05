import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { types as ms } from 'mediasoup';
import {
  ErrorCodes,
  ProtocolError,
  type ChatMessage,
  type ClientRequests,
  type LobbyPeer,
  type PeerInfo,
  type ProducerAppData,
  type RoomInfo,
  type ServerNotificationMethod,
  type ServerNotifications,
} from '@meet/protocol';
import { config } from '../config.js';
import { childLogger, type Logger } from '../logger.js';
import type { Connection } from '../signaling/Connection.js';
import { Peer } from './Peer.js';
import { MeetingRecorder } from '../recording/MeetingRecorder.js';

export interface RoomOptions {
  id: string;
  name: string;
  router: ms.Router;
  webRtcServer?: ms.WebRtcServer;
  releaseRouter: () => void;
  lobbyEnabled?: boolean;
  maxPeers?: number;
}

interface LobbyEntry extends LobbyPeer {
  connection: Connection;
  peer: Peer;
}

/**
 * A single meeting: one mediasoup Router plus all peer, moderation and chat state.
 *
 * Everything media-related for a room lives on one worker, so the room object is
 * effectively single-threaded and needs no locking.
 */
export class Room extends EventEmitter {
  readonly id: string;
  readonly createdAt = Date.now();
  private readonly log: Logger;
  private readonly router: ms.Router;
  private readonly webRtcServer?: ms.WebRtcServer;
  private readonly releaseRouter: () => void;

  private readonly peers = new Map<string, Peer>();
  private readonly lobby = new Map<string, LobbyEntry>();
  private readonly chatHistory: ChatMessage[] = [];

  private audioLevelObserver?: ms.AudioLevelObserver;
  private activeSpeakerObserver?: ms.ActiveSpeakerObserver;
  private recorder?: MeetingRecorder;

  private settings: {
    name: string;
    locked: boolean;
    lobbyEnabled: boolean;
    allowUnmute: boolean;
    allowScreenShare: boolean;
    allowChat: boolean;
    maxPeers: number;
  };

  private closed = false;
  private currentActiveSpeaker: string | null = null;

  constructor(options: RoomOptions) {
    super();
    this.id = options.id;
    this.router = options.router;
    this.webRtcServer = options.webRtcServer;
    this.releaseRouter = options.releaseRouter;
    this.log = childLogger('room', { roomId: options.id });
    this.settings = {
      name: options.name,
      locked: false,
      lobbyEnabled: options.lobbyEnabled ?? false,
      allowUnmute: true,
      allowScreenShare: true,
      allowChat: true,
      maxPeers: options.maxPeers ?? config.room.maxPeers,
    };
  }

  static async create(options: RoomOptions): Promise<Room> {
    const room = new Room(options);
    await room.initObservers();
    return room;
  }

  private async initObservers(): Promise<void> {
    // Dominant-speaker detection drives the big tile in speaker view.
    this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({ interval: 300 });
    this.activeSpeakerObserver.on('dominantspeaker', ({ producer }) => {
      const peerId = (producer.appData as { peerId?: string }).peerId ?? null;
      if (peerId === this.currentActiveSpeaker) return;
      this.currentActiveSpeaker = peerId;
      this.broadcast('activeSpeaker', { peerId });
    });

    // Continuous levels drive the per-tile mic ring.
    this.audioLevelObserver = await this.router.createAudioLevelObserver({
      maxEntries: 8,
      threshold: -65,
      interval: 400,
    });
    this.audioLevelObserver.on('volumes', (volumes) => {
      const levels = volumes.map(({ producer, volume }) => ({
        peerId: (producer.appData as { peerId?: string }).peerId ?? '',
        // mediasoup reports dBov in [-127, 0]; normalise to a 0..1 UI value.
        volume: Math.max(0, Math.min(1, (volume + 60) / 60)),
      }));
      this.broadcast('audioLevels', { levels });
    });
    this.audioLevelObserver.on('silence', () => {
      this.broadcast('audioLevels', { levels: [] });
      if (this.currentActiveSpeaker !== null) {
        this.currentActiveSpeaker = null;
        this.broadcast('activeSpeaker', { peerId: null });
      }
    });
  }

  /* ------------------------------------------------------------- accessors */

  get peerCount(): number {
    return this.peers.size;
  }

  get isEmpty(): boolean {
    return this.peers.size === 0 && this.lobby.size === 0;
  }

  get rtpCapabilities(): ms.RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  get info(): RoomInfo {
    return {
      id: this.id,
      name: this.settings.name,
      locked: this.settings.locked,
      lobbyEnabled: this.settings.lobbyEnabled,
      recording: Boolean(this.recorder?.active),
      allowUnmute: this.settings.allowUnmute,
      allowScreenShare: this.settings.allowScreenShare,
      allowChat: this.settings.allowChat,
      createdAt: this.createdAt,
      maxPeers: this.settings.maxPeers,
    };
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  listPeers(): PeerInfo[] {
    return [...this.peers.values()].filter((p) => p.joined).map((p) => p.toInfo());
  }

  /* ------------------------------------------------------- peer lifecycle */

  /**
   * Registers a connection with the room. The peer is not visible to others until
   * it completes the `join` request.
   */
  createPeer(peerId: string, displayName: string, connection: Connection): Peer {
    if (this.peers.has(peerId)) throw new ProtocolError(ErrorCodes.ALREADY_JOINED, 'peer id already in this room');
    const peer = new Peer(peerId, displayName, connection);
    // The first person into the room runs it.
    if (this.peers.size === 0 && this.lobby.size === 0) peer.role = 'host';
    this.peers.set(peerId, peer);
    return peer;
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      const wasHost = peer.role === 'host';
      const wasSharing = peer.screenSharing;
      peer.close();
      this.peers.delete(peerId);
      if (peer.joined) {
        this.broadcast('peerClosed', { peerId });
        if (wasSharing) this.log.info({ peerId }, 'screen share ended (peer left)');
      }
      // Never leave a meeting without a host: promote the longest-present peer.
      if (wasHost) this.promoteNewHost();
      this.log.info({ peerId, remaining: this.peers.size }, 'peer removed');
    }

    const lobbyEntry = this.lobby.get(peerId);
    if (lobbyEntry) {
      this.lobby.delete(peerId);
      this.notifyLobbyChange();
    }

    if (this.isEmpty) this.emit('empty');
  }

  private promoteNewHost(): void {
    const remaining = [...this.peers.values()].filter((p) => p.joined);
    if (remaining.length === 0) return;
    if (remaining.some((p) => p.role === 'host')) return;
    const coHost = remaining.find((p) => p.role === 'co-host');
    const next = coHost ?? remaining.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    next.role = 'host';
    this.broadcast('peerUpdated', { peerId: next.id, role: 'host' });
    this.log.info({ peerId: next.id }, 'promoted new host');
  }

  /* ------------------------------------------------------------- lobby */

  addToLobby(peer: Peer): void {
    this.peers.delete(peer.id);
    this.lobby.set(peer.id, {
      id: peer.id,
      displayName: peer.displayName,
      device: peer.device,
      requestedAt: Date.now(),
      connection: peer.connection,
      peer,
    });
    this.notifyLobbyChange();
    this.log.info({ peerId: peer.id }, 'peer waiting in lobby');
  }

  private notifyLobbyChange(): void {
    const peers: LobbyPeer[] = [...this.lobby.values()].map(({ id, displayName, device, requestedAt }) => ({
      id,
      displayName,
      device,
      requestedAt,
    }));
    for (const peer of this.peers.values()) {
      if (peer.joined && peer.isModerator) peer.connection.notify('lobbyUpdated', { peers });
    }
  }

  admitFromLobby(peerId: string, admit: boolean): void {
    const entry = this.lobby.get(peerId);
    if (!entry) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'peer is not in the lobby');
    this.lobby.delete(peerId);

    if (admit) {
      entry.peer.admittedFromLobby = true;
      this.peers.set(peerId, entry.peer);
      entry.connection.notify('lobbyAdmitted', {});
    } else {
      entry.connection.notify('lobbyDenied', { reason: 'The host did not admit you to this meeting.' });
      setTimeout(() => entry.connection.close(4003, 'denied'), 500);
    }
    this.notifyLobbyChange();
  }

  isInLobby(peerId: string): boolean {
    return this.lobby.has(peerId);
  }

  /* --------------------------------------------------------------- join */

  async join(
    peer: Peer,
    data: ClientRequests['join']['request'],
  ): Promise<ClientRequests['join']['response']> {
    if (peer.joined) throw new ProtocolError(ErrorCodes.ALREADY_JOINED, 'already joined');
    if (this.peers.size > this.settings.maxPeers) throw new ProtocolError(ErrorCodes.ROOM_FULL, 'this meeting is full');
    if (this.settings.locked && !peer.isModerator) {
      throw new ProtocolError(ErrorCodes.ROOM_LOCKED, 'this meeting is locked');
    }

    peer.displayName = data.displayName.slice(0, 64) || 'Guest';
    peer.device = data.device;
    peer.rtpCapabilities = data.rtpCapabilities;
    peer.joined = true;

    const others = [...this.peers.values()].filter((p) => p.id !== peer.id && p.joined);

    // Tell everyone else we arrived, then start consuming what they already send.
    for (const other of others) {
      other.connection.notify('newPeer', peer.toInfo());
    }

    this.log.info({ peerId: peer.id, name: peer.displayName, total: this.peers.size }, 'peer joined');

    return {
      status: 'joined',
      peers: others.map((p) => p.toInfo()),
      room: this.info,
      self: peer.toInfo(),
      chatHistory: this.chatHistory.slice(-config.room.chatHistoryLimit),
    };
  }

  /* ---------------------------------------------------------- transports */

  async createWebRtcTransport(
    peer: Peer,
    data: ClientRequests['createWebRtcTransport']['request'],
  ): Promise<ClientRequests['createWebRtcTransport']['response']> {
    const { producing, consuming, sctpCapabilities, forceTcp } = data;

    const base = {
      enableUdp: !forceTcp,
      enableTcp: true,
      preferUdp: !forceTcp,
      initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransportOptions.initialAvailableOutgoingBitrate,
      enableSctp: Boolean(sctpCapabilities),
      maxSendMessageSize: config.mediasoup.webRtcTransportOptions.maxSendMessageSize,
      maxReceiveMessageSize: config.mediasoup.webRtcTransportOptions.maxReceiveMessageSize,
      iceConsentTimeout: config.mediasoup.webRtcTransportOptions.iceConsentTimeout,
      appData: { peerId: peer.id, producing, consuming },
    };

    // `webRtcServer` and `listenInfos` are mutually exclusive in mediasoup's
    // options union, so the two shapes are built separately rather than spread.
    const options: ms.WebRtcTransportOptions = this.webRtcServer
      ? { ...base, webRtcServer: this.webRtcServer }
      : { ...base, listenInfos: [...config.mediasoup.webRtcTransportOptions.listenInfos] };

    const transport = await this.router.createWebRtcTransport(options);

    transport.on('icestatechange', (state) => {
      if (state === 'disconnected' || state === 'closed') {
        this.log.debug({ peerId: peer.id, state }, 'ice state change');
      }
    });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'failed' || state === 'closed') {
        this.log.warn({ peerId: peer.id, transportId: transport.id, state }, 'dtls failed');
      }
    });

    transport.on('sctpstatechange', (state) => {
      this.log.debug({ peerId: peer.id, state }, 'sctp state change');
    });

    // The send transport reports congestion; use it to keep total upstream sane.
    if (producing) {
      await transport.setMaxIncomingBitrate(config.mediasoup.webRtcTransportOptions.initialAvailableOutgoingBitrate * 4);
    }

    peer.transports.set(transport.id, transport);

    // A joining peer creates its transports *after* the join handshake, so every
    // producer that already existed was skipped for want of a receive transport.
    // Backfill them now. setImmediate defers past the response for this request,
    // guaranteeing the client has built its local transport before `newConsumer`
    // arrives.
    if (consuming && peer.joined) {
      setImmediate(() => this.consumeExistingProducers(peer));
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
      iceServers: config.iceServers,
    };
  }

  async connectWebRtcTransport(peer: Peer, data: ClientRequests['connectWebRtcTransport']['request']): Promise<void> {
    const transport = peer.transports.get(data.transportId);
    if (!transport) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'transport not found');
    await transport.connect({ dtlsParameters: data.dtlsParameters });
  }

  async restartIce(peer: Peer, data: ClientRequests['restartIce']['request']): Promise<{ iceParameters: unknown }> {
    const transport = peer.transports.get(data.transportId);
    if (!transport) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'transport not found');
    const iceParameters = await transport.restartIce();
    this.log.info({ peerId: peer.id, transportId: transport.id }, 'ice restarted');
    return { iceParameters };
  }

  /* ----------------------------------------------------------- producing */

  async produce(peer: Peer, data: ClientRequests['produce']['request']): Promise<{ id: string }> {
    const transport = peer.transports.get(data.transportId);
    if (!transport) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'transport not found');

    const appData = (data.appData ?? { source: data.kind === 'audio' ? 'mic' : 'webcam' }) as ProducerAppData;
    const source = appData.source;

    if ((source === 'screen' || source === 'screen-audio') && !this.settings.allowScreenShare && !peer.isModerator) {
      throw new ProtocolError(ErrorCodes.FORBIDDEN, 'the host has disabled screen sharing');
    }
    if (source === 'mic' && !this.settings.allowUnmute && !peer.isModerator) {
      throw new ProtocolError(ErrorCodes.FORBIDDEN, 'the host has muted everyone');
    }
    // One screen share at a time, exactly like Zoom's default.
    if (source === 'screen') {
      const existing = [...this.peers.values()].find((p) => p.id !== peer.id && p.screenSharing);
      if (existing) {
        throw new ProtocolError(ErrorCodes.SCREEN_SHARE_BUSY, `${existing.displayName} is already sharing their screen`);
      }
      const own = peer.producerBySource('screen');
      if (own) own.close();
    }
    if (source === 'mic' || source === 'webcam') {
      // Replacing a device produces a new track; drop the stale producer first.
      const own = peer.producerBySource(source);
      if (own) {
        own.close();
        peer.producers.delete(own.id);
      }
    }

    const producer = await transport.produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
      // Screen content is mostly static: only send when pixels actually change.
      ...(source === 'screen' ? { keyFrameRequestDelay: 2000 } : {}),
      appData: { ...appData, peerId: peer.id },
    });

    peer.producers.set(producer.id, producer);

    producer.on('score', (score) => {
      peer.connection.notify('producerScore', { producerId: producer.id, score });
    });

    producer.on('videoorientationchange', (orientation) => {
      this.log.debug({ peerId: peer.id, orientation }, 'video orientation changed');
    });

    producer.observer.on('close', () => {
      peer.producers.delete(producer.id);
      if (peer.joined) this.broadcastPeerState(peer);
    });

    if (producer.kind === 'audio' && source === 'mic') {
      await this.audioLevelObserver?.addProducer({ producerId: producer.id }).catch(() => undefined);
      await this.activeSpeakerObserver?.addProducer({ producerId: producer.id }).catch(() => undefined);
    }

    // Fan out to everyone already in the room.
    for (const other of this.peers.values()) {
      if (other.id === peer.id || !other.joined) continue;
      void this.createConsumer(other, peer, producer);
    }

    if (this.recorder?.active) {
      void this.recorder.addProducer(peer, producer).catch((error) => {
        this.log.warn({ err: error }, 'failed to add producer to recording');
      });
    }

    this.broadcastPeerState(peer);
    this.log.info({ peerId: peer.id, kind: data.kind, source, producerId: producer.id }, 'producer created');

    return { id: producer.id };
  }

  async closeProducer(peer: Peer, producerId: string): Promise<void> {
    const producer = peer.producers.get(producerId);
    if (!producer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'producer not found');
    producer.close();
    peer.producers.delete(producerId);
    this.broadcastPeerState(peer);
  }

  async setProducerPaused(peer: Peer, producerId: string, paused: boolean): Promise<void> {
    const producer = peer.producers.get(producerId);
    if (!producer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'producer not found');

    const source = (producer.appData as ProducerAppData).source;
    if (!paused && source === 'mic' && !this.settings.allowUnmute && !peer.isModerator) {
      throw new ProtocolError(ErrorCodes.FORBIDDEN, 'the host has muted everyone');
    }

    if (paused) await producer.pause();
    else await producer.resume();

    this.broadcastPeerState(peer);
  }

  /* ----------------------------------------------------------- consuming */

  /**
   * Creates a paused consumer, asks the client to build its half, then resumes.
   *
   * Creating paused is not optional: if the consumer starts flowing before the
   * client's RTCPeerConnection has the transceiver, the first key frame is lost
   * and the remote video stays black until the next one arrives.
   */
  /** Subscribes `peer` to every producer already live in the room. */
  private consumeExistingProducers(peer: Peer): void {
    for (const other of this.peers.values()) {
      if (other.id === peer.id || !other.joined) continue;
      for (const producer of other.producers.values()) {
        void this.createConsumer(peer, other, producer);
      }
    }
  }

  private async createConsumer(consumerPeer: Peer, producerPeer: Peer, producer: ms.Producer): Promise<void> {
    if (!consumerPeer.rtpCapabilities) return;
    if (consumerPeer.isClosed || consumerPeer.connection.closed) return;

    // Backfill and the live "new producer" fan-out can race for the same producer.
    for (const existing of consumerPeer.consumers.values()) {
      if (existing.producerId === producer.id) return;
    }

    if (!this.router.canConsume({ producerId: producer.id, rtpCapabilities: consumerPeer.rtpCapabilities })) {
      this.log.warn({ peerId: consumerPeer.id, producerId: producer.id }, 'peer cannot consume producer');
      return;
    }

    const transport = consumerPeer.recvTransport;
    if (!transport) {
      this.log.debug({ peerId: consumerPeer.id }, 'no receive transport yet, skipping consumer');
      return;
    }

    const source = (producer.appData as ProducerAppData).source;

    let consumer: ms.Consumer;
    try {
      consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: consumerPeer.rtpCapabilities,
        paused: true,
        ignoreDtx: false,
        appData: { peerId: producerPeer.id, source },
      });
      // Screen shares must survive congestion better than a webcam tile. Priority
      // is a post-creation setting in mediasoup, not a consume() option.
      if (source === 'screen') await consumer.setPriority(255);
    } catch (error) {
      this.log.error({ err: error, peerId: consumerPeer.id }, 'transport.consume failed');
      return;
    }

    consumerPeer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      consumerPeer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      consumerPeer.consumers.delete(consumer.id);
      consumerPeer.connection.notify('consumerClosed', { consumerId: consumer.id });
    });

    consumer.on('producerpause', () => {
      consumerPeer.connection.notify('consumerPaused', { consumerId: consumer.id });
    });

    consumer.on('producerresume', () => {
      consumerPeer.connection.notify('consumerResumed', { consumerId: consumer.id });
    });

    consumer.on('score', (score) => {
      consumerPeer.connection.notify('consumerScore', {
        consumerId: consumer.id,
        score: { score: score.score, producerScore: score.producerScore },
      });
    });

    consumer.on('layerschange', (layers) => {
      consumerPeer.connection.notify('consumerLayersChanged', {
        consumerId: consumer.id,
        spatialLayer: layers?.spatialLayer ?? null,
        temporalLayer: layers?.temporalLayer ?? null,
      });
    });

    try {
      await consumerPeer.connection.request('newConsumer', {
        peerId: producerPeer.id,
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        appData: { ...(producer.appData as ProducerAppData) },
        producerPaused: consumer.producerPaused,
      });

      await consumer.resume();

      // Nudge the encoder so the new subscriber gets a key frame immediately
      // rather than waiting for the next scheduled one.
      if (consumer.kind === 'video') {
        await consumer.requestKeyFrame().catch(() => undefined);
      }
    } catch (error) {
      this.log.warn({ err: error, peerId: consumerPeer.id }, 'client failed to create consumer');
      consumer.close();
      consumerPeer.consumers.delete(consumer.id);
    }
  }

  async setConsumerPaused(peer: Peer, consumerId: string, paused: boolean): Promise<void> {
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'consumer not found');
    if (paused) await consumer.pause();
    else await consumer.resume();
  }

  async setConsumerPreferredLayers(
    peer: Peer,
    data: ClientRequests['setConsumerPreferredLayers']['request'],
  ): Promise<void> {
    const consumer = peer.consumers.get(data.consumerId);
    if (!consumer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'consumer not found');
    await consumer.setPreferredLayers({ spatialLayer: data.spatialLayer, temporalLayer: data.temporalLayer });
  }

  async setConsumerPriority(peer: Peer, consumerId: string, priority: number): Promise<void> {
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'consumer not found');
    await consumer.setPriority(Math.max(1, Math.min(255, priority)));
  }

  async requestConsumerKeyFrame(peer: Peer, consumerId: string): Promise<void> {
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'consumer not found');
    await consumer.requestKeyFrame();
  }

  /* ---------------------------------------------------------------- stats */

  async getStats(peer: Peer, kind: 'transport' | 'producer' | 'consumer', id: string): Promise<unknown> {
    const target =
      kind === 'transport' ? peer.transports.get(id) : kind === 'producer' ? peer.producers.get(id) : peer.consumers.get(id);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, `${kind} not found`);
    return target.getStats();
  }

  /* ------------------------------------------------------- room features */

  addChatMessage(peer: Peer, text: string, to?: string): ChatMessage {
    if (!this.settings.allowChat && !peer.isModerator) {
      throw new ProtocolError(ErrorCodes.FORBIDDEN, 'the host has disabled chat');
    }
    const trimmed = text.trim().slice(0, 4000);
    if (!trimmed) throw new ProtocolError(ErrorCodes.BAD_REQUEST, 'empty message');

    const message: ChatMessage = {
      id: nanoid(12),
      peerId: peer.id,
      displayName: peer.displayName,
      text: trimmed,
      timestamp: Date.now(),
      to,
    };

    if (to) {
      const target = this.peers.get(to);
      if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'recipient not found');
      target.connection.notify('chatMessage', message);
      peer.connection.notify('chatMessage', message);
    } else {
      this.chatHistory.push(message);
      if (this.chatHistory.length > config.room.chatHistoryLimit) this.chatHistory.shift();
      this.broadcast('chatMessage', message);
    }
    return message;
  }

  setHandRaised(peer: Peer, raised: boolean): void {
    peer.handRaised = raised;
    this.broadcast('peerUpdated', { peerId: peer.id, handRaised: raised });
  }

  sendReaction(peer: Peer, emoji: string): void {
    this.broadcast('reaction', {
      peerId: peer.id,
      displayName: peer.displayName,
      emoji: emoji.slice(0, 8),
      timestamp: Date.now(),
    });
  }

  setDisplayName(peer: Peer, displayName: string): void {
    peer.displayName = displayName.trim().slice(0, 64) || peer.displayName;
    this.broadcast('peerUpdated', { peerId: peer.id, displayName: peer.displayName });
  }

  /* ---------------------------------------------------------- moderation */

  private assertModerator(peer: Peer): void {
    if (!peer.isModerator) throw new ProtocolError(ErrorCodes.FORBIDDEN, 'host privileges required');
  }

  async muteParticipant(moderator: Peer, peerId: string): Promise<void> {
    this.assertModerator(moderator);
    const target = this.peers.get(peerId);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'participant not found');
    const mic = target.producerBySource('mic');
    if (mic && !mic.paused) await mic.pause();
    target.connection.notify('moderatorAction', {
      action: 'mute',
      byPeerId: moderator.id,
      byDisplayName: moderator.displayName,
    });
    this.broadcastPeerState(target);
  }

  async muteAll(moderator: Peer, allowUnmute: boolean): Promise<void> {
    this.assertModerator(moderator);
    this.settings.allowUnmute = allowUnmute;
    for (const target of this.peers.values()) {
      if (target.id === moderator.id || !target.joined) continue;
      const mic = target.producerBySource('mic');
      if (mic && !mic.paused) await mic.pause();
      target.connection.notify('moderatorAction', {
        action: 'mute',
        byPeerId: moderator.id,
        byDisplayName: moderator.displayName,
      });
      this.broadcastPeerState(target);
    }
    this.broadcast('roomUpdated', this.info);
  }

  async stopParticipantVideo(moderator: Peer, peerId: string): Promise<void> {
    this.assertModerator(moderator);
    const target = this.peers.get(peerId);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'participant not found');
    const cam = target.producerBySource('webcam');
    if (cam) cam.close();
    target.connection.notify('moderatorAction', {
      action: 'stopVideo',
      byPeerId: moderator.id,
      byDisplayName: moderator.displayName,
    });
    this.broadcastPeerState(target);
  }

  async stopParticipantShare(moderator: Peer, peerId: string): Promise<void> {
    this.assertModerator(moderator);
    const target = this.peers.get(peerId);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'participant not found');
    for (const source of ['screen', 'screen-audio'] as const) {
      const producer = target.producerBySource(source);
      if (producer) producer.close();
    }
    target.connection.notify('moderatorAction', {
      action: 'stopShare',
      byPeerId: moderator.id,
      byDisplayName: moderator.displayName,
    });
    this.broadcastPeerState(target);
  }

  removeParticipant(moderator: Peer, peerId: string): void {
    this.assertModerator(moderator);
    const target = this.peers.get(peerId);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'participant not found');
    if (target.role === 'host') throw new ProtocolError(ErrorCodes.FORBIDDEN, 'cannot remove the host');
    target.connection.notify('removedFromRoom', { reason: `${moderator.displayName} removed you from the meeting.` });
    setTimeout(() => target.connection.close(4004, 'removed'), 500);
    this.removePeer(peerId);
  }

  setPeerRole(moderator: Peer, peerId: string, role: PeerInfo['role']): void {
    if (moderator.role !== 'host') throw new ProtocolError(ErrorCodes.FORBIDDEN, 'only the host can change roles');
    const target = this.peers.get(peerId);
    if (!target) throw new ProtocolError(ErrorCodes.NOT_FOUND, 'participant not found');
    if (role === 'host') {
      // Handing over the meeting demotes the current host to co-host.
      moderator.role = 'co-host';
      this.broadcast('peerUpdated', { peerId: moderator.id, role: 'co-host' });
    }
    target.role = role;
    this.broadcast('peerUpdated', { peerId, role });
  }

  updateSettings(moderator: Peer, patch: ClientRequests['setRoomSettings']['request']): RoomInfo {
    this.assertModerator(moderator);
    Object.assign(this.settings, patch);
    this.broadcast('roomUpdated', this.info);
    return this.info;
  }

  endMeeting(moderator: Peer): void {
    if (moderator.role !== 'host') throw new ProtocolError(ErrorCodes.FORBIDDEN, 'only the host can end the meeting');
    this.broadcast('meetingEnded', { reason: 'The host ended this meeting.' });
    setTimeout(() => this.close(), 500);
  }

  /* ---------------------------------------------------------- recording */

  async startRecording(moderator: Peer): Promise<{ recordingId: string }> {
    this.assertModerator(moderator);
    if (!config.recording.enabled) throw new ProtocolError(ErrorCodes.UNSUPPORTED, 'recording is disabled');
    if (this.recorder?.active) throw new ProtocolError(ErrorCodes.BAD_REQUEST, 'already recording');

    this.recorder = new MeetingRecorder(this.id, this.router);
    const recordingId = await this.recorder.start();

    for (const peer of this.peers.values()) {
      for (const producer of peer.producers.values()) {
        await this.recorder.addProducer(peer, producer).catch((error) => {
          this.log.warn({ err: error }, 'failed to add producer to recording');
        });
      }
    }

    this.broadcast('recordingStateChanged', { recording: true, startedBy: moderator.displayName });
    this.broadcast('roomUpdated', this.info);
    return { recordingId };
  }

  async stopRecording(moderator: Peer): Promise<void> {
    this.assertModerator(moderator);
    if (!this.recorder?.active) throw new ProtocolError(ErrorCodes.BAD_REQUEST, 'not recording');
    await this.recorder.stop();
    this.recorder = undefined;
    this.broadcast('recordingStateChanged', { recording: false });
    this.broadcast('roomUpdated', this.info);
  }

  /* ------------------------------------------------------------ helpers */

  broadcast<M extends ServerNotificationMethod>(method: M, data: ServerNotifications[M], exceptPeerId?: string): void {
    for (const peer of this.peers.values()) {
      if (!peer.joined || peer.id === exceptPeerId) continue;
      peer.connection.notify(method, data);
    }
  }

  /** Re-publishes a peer's derived media flags (mic/cam/share) to the room. */
  broadcastPeerState(peer: Peer): void {
    if (!peer.joined) return;
    this.broadcast('peerUpdated', {
      peerId: peer.id,
      audioEnabled: peer.audioEnabled,
      videoEnabled: peer.videoEnabled,
      screenSharing: peer.screenSharing,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.log.info('closing room');

    void this.recorder?.stop().catch(() => undefined);

    for (const peer of this.peers.values()) {
      peer.close();
      peer.connection.close(4000, 'room closed');
    }
    this.peers.clear();

    for (const entry of this.lobby.values()) {
      entry.connection.close(4000, 'room closed');
    }
    this.lobby.clear();

    try {
      this.router.close();
    } catch {
      /* already closed */
    }
    this.releaseRouter();
    this.emit('closed');
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
