import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import {
  ErrorCodes,
  ProtocolError,
  type Frame,
  type NotificationFrame,
  type RequestFrame,
  type ResponseFrame,
  type ServerNotificationMethod,
  type ServerNotifications,
  type ServerRequests,
} from '@meet/protocol';
import { childLogger, type Logger } from '../logger.js';

const REQUEST_TIMEOUT_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
/** Two missed heartbeats and we consider the peer gone. */
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 5_000;
const MAX_FRAME_BYTES = 512 * 1024;
/** Simple token bucket: sustained 40 req/s with a burst of 120. */
const RATE_LIMIT_CAPACITY = 120;
const RATE_LIMIT_REFILL_PER_SEC = 40;

type RequestHandler = (method: string, data: unknown) => Promise<unknown>;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * A typed request/response channel over one WebSocket.
 *
 * Both directions can issue requests. Outgoing requests time out so a wedged
 * client never leaks a promise; incoming requests are rate limited so a hostile
 * client cannot spin the SFU.
 */
export class Connection extends EventEmitter {
  readonly id: string;
  private readonly log: Logger;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private handler: RequestHandler | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private lastPongAt = Date.now();
  private tokens = RATE_LIMIT_CAPACITY;
  private lastRefillAt = Date.now();
  private _closed = false;

  constructor(
    readonly socket: WebSocket,
    id: string,
  ) {
    super();
    this.id = id;
    this.log = childLogger('connection', { connectionId: id });
    this.setMaxListeners(50);

    socket.on('message', (raw, isBinary) => this.onMessage(raw as Buffer, isBinary));
    socket.on('close', (code, reason) => {
      this.log.debug({ code, reason: reason.toString() }, 'socket closed');
      this.cleanup();
      this.emit('close');
    });
    socket.on('error', (error) => {
      this.log.warn({ err: error }, 'socket error');
      this.emit('socketError', error);
    });
    socket.on('pong', () => {
      this.lastPongAt = Date.now();
    });

    this.startHeartbeat();
  }

  get closed(): boolean {
    return this._closed || this.socket.readyState > 1;
  }

  onRequest(handler: RequestHandler): void {
    this.handler = handler;
  }

  /* ------------------------------------------------------------- outbound */

  notify<M extends ServerNotificationMethod>(method: M, data: ServerNotifications[M]): void {
    this.send({ type: 'notification', method, data } satisfies NotificationFrame);
  }

  request<M extends keyof ServerRequests>(
    method: M,
    data: ServerRequests[M]['request'],
  ): Promise<ServerRequests[M]['response']> {
    if (this.closed) return Promise.reject(new ProtocolError(ErrorCodes.INTERNAL, 'connection closed'));

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProtocolError(ErrorCodes.INTERNAL, `request "${String(method)}" timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ type: 'request', id, method: method as string, data } satisfies RequestFrame);
    });
  }

  private send(frame: Frame): void {
    if (this.closed) return;
    try {
      const payload = JSON.stringify(frame);
      // Drop notifications (but never responses) when the socket is badly backed up:
      // a stalled client must not be allowed to grow the server heap without bound.
      if (this.socket.bufferedAmount > 4 * 1024 * 1024 && frame.type === 'notification') {
        this.log.warn({ buffered: this.socket.bufferedAmount, method: frame.method }, 'dropping notification, backpressure');
        return;
      }
      this.socket.send(payload);
    } catch (error) {
      this.log.warn({ err: error }, 'failed to send frame');
    }
  }

  /* -------------------------------------------------------------- inbound */

  private onMessage(raw: Buffer, isBinary: boolean): void {
    if (isBinary) {
      this.log.warn('received binary frame, ignoring');
      return;
    }
    if (raw.length > MAX_FRAME_BYTES) {
      this.close(1009, 'frame too large');
      return;
    }

    let frame: Frame;
    try {
      frame = JSON.parse(raw.toString('utf8')) as Frame;
    } catch {
      this.log.warn('received malformed JSON');
      return;
    }

    switch (frame.type) {
      case 'request':
        void this.handleRequest(frame);
        break;
      case 'response':
        this.handleResponse(frame);
        break;
      case 'notification':
        this.emit('notification', frame.method, frame.data);
        break;
      default:
        this.log.warn({ frame }, 'unknown frame type');
    }
  }

  private consumeToken(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefillAt) / 1000;
    this.lastRefillAt = now;
    this.tokens = Math.min(RATE_LIMIT_CAPACITY, this.tokens + elapsed * RATE_LIMIT_REFILL_PER_SEC);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private async handleRequest(frame: RequestFrame): Promise<void> {
    if (!this.consumeToken()) {
      this.respond(frame.id, false, undefined, {
        code: ErrorCodes.RATE_LIMITED,
        message: 'too many requests',
      });
      return;
    }

    if (!this.handler) {
      this.respond(frame.id, false, undefined, {
        code: ErrorCodes.INTERNAL,
        message: 'no request handler registered',
      });
      return;
    }

    try {
      const result = await this.handler(frame.method, frame.data);
      this.respond(frame.id, true, result ?? {});
    } catch (error) {
      const isProtocol = error instanceof ProtocolError;
      if (!isProtocol) {
        this.log.error({ err: error, method: frame.method }, 'request handler threw');
      } else {
        this.log.debug({ code: error.code, method: frame.method, msg: error.message }, 'request rejected');
      }
      this.respond(frame.id, false, undefined, {
        code: isProtocol ? error.code : ErrorCodes.INTERNAL,
        message: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  private respond(id: number, ok: boolean, data?: unknown, error?: { code: string; message: string }): void {
    this.send({ type: 'response', id, ok, data, error } satisfies ResponseFrame);
  }

  private handleResponse(frame: ResponseFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (frame.ok) pending.resolve(frame.data);
    else pending.reject(new ProtocolError((frame.error?.code as never) ?? ErrorCodes.INTERNAL, frame.error?.message ?? 'request failed'));
  }

  /* ------------------------------------------------------------ lifecycle */

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.log.info('heartbeat timeout, terminating socket');
        this.socket.terminate();
        return;
      }
      try {
        this.socket.ping();
      } catch {
        /* socket already gone */
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private cleanup(): void {
    this._closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new ProtocolError(ErrorCodes.INTERNAL, 'connection closed'));
    }
    this.pending.clear();
  }

  close(code = 1000, reason = 'closed'): void {
    if (this.closed) return;
    try {
      this.socket.close(code, reason);
    } catch {
      this.socket.terminate();
    }
    this.cleanup();
  }
}
