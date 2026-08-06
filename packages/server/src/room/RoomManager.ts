import { generateRoomId, isValidRoomId, normalizeRoomId, ErrorCodes, ProtocolError } from '@meet/protocol';
import { config } from '../config.js';
import { childLogger } from '../logger.js';
import { workerPool } from '../sfu/WorkerPool.js';
import { Room } from './Room.js';

const log = childLogger('room-manager');

interface RoomRecord {
  room: Room;
  /** Set while the room is empty; cancelled if someone rejoins in time. */
  reapTimer?: NodeJS.Timeout;
  /** Optional passcode required to join. */
  passcode?: string;
  lobbyEnabled: boolean;
}

/**
 * Creates, finds and reaps rooms.
 *
 * Rooms are created lazily on first join (so a shared link just works) and torn
 * down after a grace period once empty, which keeps a reconnecting peer from
 * losing the meeting during a brief network blip.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  /** Rooms explicitly scheduled ahead of time via the REST API. */
  private readonly reservations = new Map<string, { name?: string; passcode?: string; lobbyEnabled: boolean; createdAt: number }>();
  private creating = new Map<string, Promise<Room>>();

  async getOrCreate(roomId: string): Promise<Room> {
    const id = normalizeRoomId(roomId);
    if (!isValidRoomId(id)) throw new ProtocolError(ErrorCodes.BAD_REQUEST, 'invalid meeting id');

    const existing = this.rooms.get(id);
    if (existing && !existing.room.isClosed) {
      if (existing.reapTimer) {
        clearTimeout(existing.reapTimer);
        existing.reapTimer = undefined;
      }
      return existing.room;
    }

    // Two peers joining the same brand-new room at once must share one router.
    const inFlight = this.creating.get(id);
    if (inFlight) return inFlight;

    const promise = this.createRoom(id).finally(() => this.creating.delete(id));
    this.creating.set(id, promise);
    return promise;
  }

  private async createRoom(id: string): Promise<Room> {
    const reservation = this.reservations.get(id);
    const { router, webRtcServer, release } = await workerPool.createRouter();

    const room = await Room.create({
      id,
      name: reservation?.name,
      router,
      webRtcServer,
      releaseRouter: release,
      lobbyEnabled: reservation?.lobbyEnabled ?? false,
      maxPeers: config.room.maxPeers,
    });

    const record: RoomRecord = {
      room,
      passcode: reservation?.passcode,
      lobbyEnabled: reservation?.lobbyEnabled ?? false,
    };
    this.rooms.set(id, record);

    room.on('empty', () => {
      if (record.reapTimer) clearTimeout(record.reapTimer);
      record.reapTimer = setTimeout(() => {
        if (room.isEmpty && !room.isClosed) {
          log.info({ roomId: id }, 'reaping empty room');
          room.close();
        }
      }, config.room.emptyRoomTtlMs);
    });

    room.on('closed', () => {
      const current = this.rooms.get(id);
      if (current?.room === room) this.rooms.delete(id);
    });

    log.info({ roomId: id }, 'room created');
    return room;
  }

  get(roomId: string): Room | undefined {
    const record = this.rooms.get(normalizeRoomId(roomId));
    return record && !record.room.isClosed ? record.room : undefined;
  }

  passcodeFor(roomId: string): string | undefined {
    return this.rooms.get(normalizeRoomId(roomId))?.passcode ?? this.reservations.get(normalizeRoomId(roomId))?.passcode;
  }

  /** Pre-creates a room id with settings, without spinning up a router yet. */
  reserve(options: { name?: string; passcode?: string; lobbyEnabled?: boolean } = {}): {
    roomId: string;
    name?: string;
  } {
    let roomId = generateRoomId();
    let attempts = 0;
    while ((this.rooms.has(roomId) || this.reservations.has(roomId)) && attempts++ < 20) {
      roomId = generateRoomId();
    }
    // No fallback title: an unnamed meeting stays unnamed on the wire so each
    // client can render "Meeting <id>" in the language its user reads.
    const name = options.name?.trim().slice(0, 120) || undefined;
    this.reservations.set(roomId, {
      name,
      passcode: options.passcode,
      lobbyEnabled: options.lobbyEnabled ?? false,
      createdAt: Date.now(),
    });
    // Reservations are cheap but should not accumulate forever.
    setTimeout(() => {
      if (!this.rooms.has(roomId)) this.reservations.delete(roomId);
    }, 24 * 60 * 60 * 1000).unref?.();
    return { roomId, name };
  }

  exists(roomId: string): boolean {
    const id = normalizeRoomId(roomId);
    return this.rooms.has(id) || this.reservations.has(id);
  }

  stats(): { rooms: number; peers: number; detail: Array<{ id: string; peers: number; createdAt: number }> } {
    const detail = [...this.rooms.values()].map(({ room }) => ({
      id: room.id,
      peers: room.peerCount,
      createdAt: room.createdAt,
    }));
    return {
      rooms: detail.length,
      peers: detail.reduce((sum, r) => sum + r.peers, 0),
      detail,
    };
  }

  closeAll(): void {
    for (const { room, reapTimer } of this.rooms.values()) {
      if (reapTimer) clearTimeout(reapTimer);
      room.close();
    }
    this.rooms.clear();
  }
}

export const roomManager = new RoomManager();
