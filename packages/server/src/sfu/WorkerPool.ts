import * as mediasoup from 'mediasoup';
import type { types as ms } from 'mediasoup';
import { config } from '../config.js';
import { childLogger } from '../logger.js';

const log = childLogger('worker-pool');

interface PooledWorker {
  worker: ms.Worker;
  webRtcServer?: ms.WebRtcServer;
  /** Number of routers currently hosted, used for least-loaded assignment. */
  routerCount: number;
  index: number;
}

/**
 * Owns every mediasoup worker process.
 *
 * mediasoup workers are single-threaded C++ processes; throughput scales by
 * running one per core and pinning each room's router to exactly one worker
 * (a router cannot span workers). Rooms are assigned to the least loaded worker,
 * which keeps a big meeting from landing on a worker that is already saturated.
 */
export class WorkerPool {
  private workers: PooledWorker[] = [];
  private closed = false;

  async init(): Promise<void> {
    mediasoup.observer.on('newworker', (worker) => {
      log.debug({ pid: worker.pid }, 'mediasoup worker created');
    });

    const count = config.mediasoup.numWorkers;
    log.info({ count, version: mediasoup.version }, 'starting mediasoup workers');

    for (let i = 0; i < count; i++) {
      const worker = await mediasoup.createWorker(config.mediasoup.workerSettings);

      worker.on('died', (error) => {
        log.fatal({ err: error, pid: worker.pid }, 'mediasoup worker died — exiting so the supervisor restarts us');
        // A dead worker means every room on it lost its media plane. There is no
        // safe partial recovery: fail fast and let the process manager restart.
        setTimeout(() => process.exit(1), 2000);
      });

      const pooled: PooledWorker = { worker, routerCount: 0, index: i };

      if (config.mediasoup.webRtcServer.enabled) {
        // A WebRtcServer multiplexes every transport on this worker onto a single
        // UDP and TCP port. That makes firewall rules trivial (one port per worker)
        // and removes per-transport port exhaustion at scale.
        const port = config.mediasoup.webRtcServer.basePort + i;
        pooled.webRtcServer = await worker.createWebRtcServer({
          listenInfos: [
            {
              protocol: 'udp',
              ip: config.mediasoup.webRtcTransportOptions.listenInfos[0].ip,
              announcedAddress: config.mediasoup.announcedIp,
              port,
            },
            {
              protocol: 'tcp',
              ip: config.mediasoup.webRtcTransportOptions.listenInfos[0].ip,
              announcedAddress: config.mediasoup.announcedIp,
              port,
            },
          ],
        });
        log.info({ workerPid: worker.pid, port }, 'WebRtcServer listening');
      }

      this.workers.push(pooled);
    }

    log.info({ announcedIp: config.mediasoup.announcedIp }, 'mediasoup ready');
  }

  /** Picks the worker hosting the fewest routers. */
  private leastLoaded(): PooledWorker {
    if (this.workers.length === 0) throw new Error('WorkerPool not initialised');
    return this.workers.reduce((best, w) => (w.routerCount < best.routerCount ? w : best));
  }

  async createRouter(): Promise<{ router: ms.Router; webRtcServer?: ms.WebRtcServer; release: () => void }> {
    const pooled = this.leastLoaded();
    const router = await pooled.worker.createRouter(config.mediasoup.routerOptions);
    pooled.routerCount++;

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pooled.routerCount = Math.max(0, pooled.routerCount - 1);
    };
    router.on('@close', release);

    log.debug({ workerPid: pooled.worker.pid, routerId: router.id, load: pooled.routerCount }, 'router created');
    return { router, webRtcServer: pooled.webRtcServer, release };
  }

  async usage(): Promise<Array<{ pid: number; routers: number; cpu: ms.WorkerResourceUsage }>> {
    return Promise.all(
      this.workers.map(async (w) => ({
        pid: w.worker.pid,
        routers: w.routerCount,
        cpu: await w.worker.getResourceUsage(),
      })),
    );
  }

  get size(): number {
    return this.workers.length;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    log.info('closing mediasoup workers');
    for (const { worker } of this.workers) {
      try {
        worker.close();
      } catch (error) {
        log.warn({ err: error }, 'error closing worker');
      }
    }
    this.workers = [];
  }
}

export const workerPool = new WorkerPool();
