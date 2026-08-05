/* eslint-disable @typescript-eslint/no-explicit-any */
import { authApi } from '../api/auth';
import { WS_SERVER_EVENTS } from '../types/websocket';
import type { WsClientPayloads, WsServerPayloads, WsErrorCode } from '../types/websocket';

type ServerEvent = keyof WsServerPayloads;
type ClientEvent = keyof WsClientPayloads;
type Handler<T> = (data: T) => void;

let socket: WebSocket | null = null;

const handlers = new Map<ServerEvent, Set<Handler<any>>>();
let reconnecting = false;
let currentUrl = '';

// Exact codes thrown by authService.authenticateWsConnection on auth failure
const AUTH_ERROR_CODES: Set<WsErrorCode> = new Set([
  'WS_AUTH:INVALID_ACCESS_TOKEN',
  'WS_AUTH:INVALID_SESSION',
  'WS_AUTH:SESSION_REVOKED',
  'WS_AUTH:EXPIRED_SESSION',
]);

function handleOpen() {
  console.log('[ws] connected');
}

function handleMessage(event: MessageEvent) {
  try {
    const { type, data } = JSON.parse(event.data) as {
      type: ServerEvent;
      data: unknown;
    };

    // Auth failures arrive as a normal ERROR message, not a socket close —
    // the server keeps the connection open even when unauthenticated.
    if (type === WS_SERVER_EVENTS.ERROR) {
      const errorData = data as WsServerPayloads[typeof WS_SERVER_EVENTS.ERROR];

      // Guard against the case where the server sends a plain string
      // instead of the expected { success, error } shape (unhandled errors)
      const code = errorData?.error?.code;

      if (code && AUTH_ERROR_CODES.has(code)) {
        // SESSION_REVOKED means the session was explicitly invalidated
        // (e.g. logout elsewhere) — refresh will fail too, go straight to login
        if (code === 'WS_AUTH:SESSION_REVOKED') {
          window.location.href = '/login';
          return;
        }

        if (!reconnecting) handleAuthError();
        return;
      }
    }

    handlers.get(type)?.forEach((handler) => handler(data));
  } catch (err) {
    console.error('[ws] invalid message', err);
  }
}

async function handleAuthError() {
  reconnecting = true;
  try {
    await authApi.refresh();
    disconnect();
    connect(currentUrl);
  } catch {
    window.location.href = '/login';
  } finally {
    reconnecting = false;
  }
}

function handleClose(event: CloseEvent) {
  console.log('[ws] CLOSE', {
    code: event.code,
    reason: event.reason,
    wasClean: event.wasClean,
  });
}

function handleError(event: Event) {
  console.log('[ws] ERROR', event);
}

export function connect(url: string) {
  console.log('[ws] connecting to:', url);
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    console.warn('[ws] connection already active, ignoring connect()');
    return;
  }

  currentUrl = url;
  socket = new WebSocket(url);

  socket.onopen = handleOpen;
  socket.onmessage = handleMessage;
  socket.onclose = handleClose;
  socket.onerror = handleError;
}

export function disconnect() {
  console.trace('[ws] DISCONNECT');
  socket?.close();
  socket = null;
}

export function emit<E extends ClientEvent>(type: E, data: WsClientPayloads[E]) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  } else {
    console.warn('[ws] socket not open, event dropped:', type);
  }
}

export function on<E extends ServerEvent>(type: E, handler: Handler<WsServerPayloads[E]>) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);

  return () => handlers.get(type)?.delete(handler);
}

export const wsClient = { connect, disconnect, emit, on };
