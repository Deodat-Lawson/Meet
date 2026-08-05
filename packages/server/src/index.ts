import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { assertProductionSecrets } from './auth.js';
import { workerPool } from './sfu/WorkerPool.js';
import { roomManager } from './room/RoomManager.js';
import { signalingServer } from './signaling/SignalingServer.js';
import { registerRoutes } from './http/routes.js';

async function main(): Promise<void> {
  assertProductionSecrets();

  const https =
    config.http.tls && config.http.tlsCert && config.http.tlsKey
      ? { key: fs.readFileSync(config.http.tlsKey), cert: fs.readFileSync(config.http.tlsCert) }
      : undefined;

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    ...(https ? { https } : {}),
  });

  await app.register(cors, {
    origin: config.http.corsOrigins.includes('*') ? true : config.http.corsOrigins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    // The WebSocket upgrade is rate limited by the connection layer instead.
    allowList: (request) => request.url.startsWith('/ws'),
  });

  await registerRoutes(app);

  await workerPool.init();

  await app.listen({ host: config.http.host, port: config.http.port });
  signalingServer.attach(app.server);

  logger.info(
    {
      url: `${config.http.tls ? 'https' : 'http'}://${config.http.host}:${config.http.port}`,
      lan: `${config.http.tls ? 'https' : 'http'}://${config.mediasoup.announcedIp}:${config.http.port}`,
      workers: workerPool.size,
    },
    'Meet server ready',
  );

  /* ------------------------------------------------------------ shutdown */

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    signalingServer.close();
    roomManager.closeAll();
    await app.close().catch(() => undefined);
    await workerPool.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
