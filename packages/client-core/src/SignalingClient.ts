import {
  ErrorCodes,
  ProtocolError,
  type ClientRequestMethod,
  type ClientRequests,
  type Frame,
  type ServerNotificationMethod,
  type ServerNotifications,
  type ServerRequestMethod,
  type ServerRequests,
} from '@meet/protocol';
import { Emitter } from './emitter.js';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 15_000;
const BASE_RECONNECT_DELAY_MS = 500;

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed';

interface SignalingEvents {
  stateChanged: ConnectionState;
  notification: { method: ServerNotificationMethod; data: unknown };
  /** Fired after a reconnect so the room can rebuild its media session. */
  reconnected: void;
  closed: { code: number; reason: string };
}

export interface SignalingOptions {
  url: string;
  roomId: string;
  peerId: string;
  displayName: string;
  token?: string;
  /** Injected so React Native can pass its own WebSocket if needed. */
  WebSocketImpl?: typeof WebSocket;
  maxReconnectAttempts?: number;
}

type ServerRequestHandler = <M extends ServerRequestMethod>(
  method: M,
  data: ServerRequests[M]['request'],
) => Promise<ServerRequests[M]['response']>;

/**
 * WebSocket signaling with automatic, jittered reconnection.
 *
 * Reconnects reuse the same peerId so the server can tell a flaky network from a
 * genuine second participant. Requests issued while offline reject immediately
 * rather than queueing — the room layer decides what is worth retrying.
 */
export class SignalingClient extends Emitter<SignalingEvents> {
  private socket?: WebSocket;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: never) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private handler?: ServerRequestHandler;
  private _state: ConnectionState = 'new';
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private intentionallyClosed = false;
  private hasConnectedOnce = false;

  constructor(private readonly options: SignalingOptions) {
    super();
  }

  get state(): ConnectionState {
    return this._state;
  }

  get connected(): boolean {
    return this._state === 'connected';
  }

  onServerRequest(handler: ServerRequestHandler): void {
    this.handler = handler;
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('stateChanged', state);
  }

  private buildUrl(): string {
    const url = new URL(this.options.url);
    url.searchParams.set('roomId', this.options.roomId);
    url.searchParams.set('peerId', this.options.peerId);
    url.searchParams.set('displayName', this.options.displayName);
    if (this.options.token) url.searchParams.set('token', this.options.token);
    return url.toString();
  }

  connect(): Promise<void> {
    this.intentionallyClosed = false;
    this.setState(this.hasConnectedOnce ? 'reconnecting' : 'connecting');

    return new Promise((resolve, reject) => {
      const Impl = this.options.WebSocketImpl ?? WebSocket;
      let settled = false;

      let socket: WebSocket;
      try {
        socket = new Impl(this.buildUrl());
      } catch (error) {
        reject(error instanceof Error ? error : new Error('failed to open socket'));
        return;
      }
      this.socket = socket;

      socket.onopen = () => {
        settled = true;
        const wasReconnect = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        this.reconnectAttempts = 0;
        this.setState('connected');
        if (wasReconnect) this.emit('reconnected', undefined);
        resolve();
      };

      socket.onmessage = (event) => this.onMessage(event.data as string);

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };

      socket.onclose = (event) => {
        // React Native's close event leaves both fields optional; 1006 is the
        // standard "closed abnormally" code for a socket that died mid-flight.
        const code = event?.code ?? 1006;
        const reason = event?.reason ?? '';

        this.failPending(new ProtocolError(ErrorCodes.INTERNAL, 'connection closed'));
        this.emit('closed', { code, reason });

        // 4000-4099 are deliberate server-side rejections (room closed, removed,
        // bad token). Retrying those just loops.
        const permanent = code >= 4000 && code < 4100;
        if (this.intentionallyClosed || permanent) {
          this.setState('closed');
          if (!settled) {
            settled = true;
            reject(new Error(reason || `connection closed (${code})`));
          }
          return;
        }
        this.scheduleReconnect();
        if (!settled) {
          settled = true;
          reject(new Error(reason || 'connection closed before it opened'));
        }
      };
    });
  }

  private scheduleReconnect(): void {
    const max = this.options.maxReconnectAttempts ?? 30;
    if (this.reconnectAttempts >= max) {
      this.setState('failed');
      return;
    }
    this.setState('reconnecting');

    // Exponential backoff with full jitter: keeps a server restart from being
    // hammered by every client waking at the same millisecond.
    const exponential = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    const delay = Math.random() * exponential;
    this.reconnectAttempts++;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        /* onclose schedules the next attempt */
      });
    }, delay);
  }

  /* ------------------------------------------------------------ messaging */

  request<M extends ClientRequestMethod>(
    method: M,
    data: ClientRequests[M]['request'] = {} as ClientRequests[M]['request'],
  ): Promise<ClientRequests[M]['response']> {
    if (!this.socket || this.socket.readyState !== 1) {
      return Promise.reject(new ProtocolError(ErrorCodes.INTERNAL, 'not connected'));
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProtocolError(ErrorCodes.INTERNAL, `request "${method}" timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, timer });
      this.socket!.send(JSON.stringify({ type: 'request', id, method, data }));
    });
  }

  notify<M extends string>(method: M, data: unknown): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({ type: 'notification', method, data }));
  }

  private onMessage(raw: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(raw) as Frame;
    } catch {
      console.warn('[signaling] malformed frame');
      return;
    }

    switch (frame.type) {
      case 'response': {
        const pending = this.pending.get(frame.id);
        if (!pending) return;
        this.pending.delete(frame.id);
        clearTimeout(pending.timer);
        if (frame.ok) pending.resolve(frame.data as never);
        else
          pending.reject(
            new ProtocolError((frame.error?.code as never) ?? ErrorCodes.INTERNAL, frame.error?.message ?? 'request failed'),
          );
        break;
      }

      case 'request':
        void this.handleServerRequest(frame.id, frame.method as ServerRequestMethod, frame.data);
        break;

      case 'notification':
        this.emit('notification', {
          method: frame.method as ServerNotificationMethod,
          data: frame.data as ServerNotifications[ServerNotificationMethod],
        });
        break;
    }
  }

  private async handleServerRequest(id: number, method: ServerRequestMethod, data: unknown): Promise<void> {
    if (!this.handler) {
      this.respond(id, false, undefined, { code: ErrorCodes.INTERNAL, message: 'no handler' });
      return;
    }
    try {
      const result = await this.handler(method, data as never);
      this.respond(id, true, result);
    } catch (error) {
      this.respond(id, false, undefined, {
        code: error instanceof ProtocolError ? error.code : ErrorCodes.INTERNAL,
        message: error instanceof Error ? error.message : 'handler failed',
      });
    }
  }

  private respond(id: number, ok: boolean, data?: unknown, error?: { code: string; message: string }): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({ type: 'response', id, ok, data, error }));
  }

  private failPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.failPending(new ProtocolError(ErrorCodes.INTERNAL, 'client closed'));
    try {
      this.socket?.close(1000, 'bye');
    } catch {
      /* ignore */
    }
    this.setState('closed');
    this.removeAllListeners();
  }
}
