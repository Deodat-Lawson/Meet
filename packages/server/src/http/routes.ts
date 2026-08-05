import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isValidRoomId, normalizeRoomId } from '@meet/protocol';
import { config } from '../config.js';
import { issueJoinToken } from '../auth.js';
import { roomManager } from '../room/RoomManager.js';
import { workerPool } from '../sfu/WorkerPool.js';
import { signalingServer } from '../signaling/SignalingServer.js';

const startedAt = Date.now();

/**
 * `app` is intentionally loose in its logger/server generics: Fastify infers a
 * concrete pino Logger type from `loggerInstance`, which does not unify with the
 * default `FastifyBaseLogger` in the plain `FastifyInstance` alias.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = FastifyInstance<any, any, any, any, any>;

export async function registerRoutes(app: App): Promise<void> {
  /* ------------------------------------------------------------- health */

  app.get('/health', async () => ({
    status: 'ok',
    uptimeMs: Date.now() - startedAt,
    version: process.env.npm_package_version ?? '1.0.0',
  }));

  app.get('/api/metrics', async () => {
    const { rooms, peers, detail } = roomManager.stats();
    return {
      rooms,
      peers,
      connections: signalingServer.connectionCount,
      workers: await workerPool.usage(),
      detail,
      memory: process.memoryUsage(),
      uptimeMs: Date.now() - startedAt,
    };
  });

  /** Public runtime config the clients need before they connect. */
  app.get('/api/config', async () => ({
    iceServers: config.iceServers,
    maxPeers: config.room.maxPeers,
    recordingEnabled: config.recording.enabled,
  }));

  /* -------------------------------------------------------------- rooms */

  const createRoomSchema = z.object({
    name: z.string().max(120).optional(),
    passcode: z.string().min(4).max(32).optional(),
    lobbyEnabled: z.boolean().optional(),
  });

  app.post('/api/rooms', async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: parsed.error.issues[0]?.message });
    }
    const { roomId, name } = roomManager.reserve(parsed.data);
    return reply.status(201).send({
      roomId,
      name,
      hasPasscode: Boolean(parsed.data.passcode),
      lobbyEnabled: parsed.data.lobbyEnabled ?? false,
      joinUrl: `/room/${roomId}`,
    });
  });

  app.get('/api/rooms/:roomId', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const id = normalizeRoomId(roomId);
    if (!isValidRoomId(id)) return reply.status(400).send({ error: 'BAD_REQUEST', message: 'invalid meeting id' });

    const room = roomManager.get(id);
    return {
      roomId: id,
      exists: roomManager.exists(id),
      active: Boolean(room),
      hasPasscode: Boolean(roomManager.passcodeFor(id)),
      peers: room?.peerCount ?? 0,
      locked: room?.info.locked ?? false,
      name: room?.info.name,
    };
  });

  const joinSchema = z.object({
    displayName: z.string().min(1).max(64),
    passcode: z.string().max(32).optional(),
  });

  /** Exchanges an optional passcode for a signed, short-lived join token. */
  app.post('/api/rooms/:roomId/join', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const id = normalizeRoomId(roomId);
    if (!isValidRoomId(id)) return reply.status(400).send({ error: 'BAD_REQUEST', message: 'invalid meeting id' });

    const parsed = joinSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: parsed.error.issues[0]?.message });
    }

    const required = roomManager.passcodeFor(id);
    if (required && parsed.data.passcode !== required) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Incorrect meeting passcode.' });
    }

    const room = roomManager.get(id);
    if (room?.info.locked) {
      return reply.status(423).send({ error: 'ROOM_LOCKED', message: 'This meeting is locked.' });
    }

    const token = issueJoinToken({ roomId: id, displayName: parsed.data.displayName });
    return { token, roomId: id, expiresIn: config.auth.tokenTtlSeconds };
  });

  /* ---------------------------------------------------------- recordings */

  app.get('/api/recordings', async () => {
    const fs = await import('node:fs/promises');
    const dir = path.resolve(config.recording.outputDir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const recordings = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(dir, entry.name, 'manifest.json'), 'utf8'));
          recordings.push(manifest);
        } catch {
          recordings.push({ recordingId: entry.name, incomplete: true });
        }
      }
      return { recordings };
    } catch {
      return { recordings: [] };
    }
  });

  /* --------------------------------------------------------- static SPA */

  if (config.http.serveStatic) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(here, '../..', config.http.staticDir);
    const fastifyStatic = (await import('@fastify/static')).default;
    await app.register(fastifyStatic, { root, prefix: '/' });

    // History-API fallback so deep links like /room/abc-defg-hij load the SPA.
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }
      return reply.sendFile('index.html');
    });
  }
}
