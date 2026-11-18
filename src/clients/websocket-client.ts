/* eslint-disable @typescript-eslint/no-explicit-any */
import { authService } from '@services/auth';
import { WS_SERVER_EVENTS } from '@/types/websocket';
import type { WsClientPayloads, WsServerPayloads } from '../types/websocket';

type ServerEvent = keyof WsServerPayloads;
type ClientEvent = keyof WsClientPayloads;
type Handler<T> = (data: T) => void;

let socket: WebSocket | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const earlyInvitations = new Map<string, WsServerPayloads['GROUP_INVITATION']>();

function rejectPendingRequests() {
  for (const request of pendingRequests.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('Se perdió la conexión. Inténtalo de nuevo.'));
  }
  pendingRequests.clear();
}

const handlers = new Map<ServerEvent, Set<Handler<any>>>();

let reconnecting = false;
let manualDisconnect = false;
let currentUrl = '';

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 300;

/**
 * Authentication errors that require refreshing the session.
 */
const AUTH_ERROR_MESSAGES: Set<string> = new Set([
  'WS_AUTH:INVALID_ACCESS_TOKEN',
  'WS_AUTH:INVALID_SESSION',
  'WS_AUTH:SESSION_REVOKED',
  'WS_AUTH:EXPIRED_SESSION',
]);

function getReconnectDelay(): number {
  // Calculate the exponential backoff delay, capped at the maximum.
  const exponentialDelay = Math.min(
    INITIAL_RECONNECT_DELAY * 2 ** reconnectAttempts,
    MAX_RECONNECT_DELAY,
  );

  // Apply full jitter to spread reconnection attempts over time.
  return Math.floor(Math.random() * exponentialDelay);
}

function handleOpen() {
  console.log('[ws] connected');

  /**
   * Connection successfully established.
   *
   * Reset exponential backoff.
   */
  reconnectAttempts = 0;
}

function handleMessage(event: MessageEvent) {
  try {
    const { type, data, requestId } = JSON.parse(event.data) as {
      requestId?: string;
      type: ServerEvent;
      data: unknown;
    };

    if (
      requestId &&
      pendingRequests.has(requestId) &&
      (type === WS_SERVER_EVENTS.GROUP_ACTION_CONFIRMED || type === WS_SERVER_EVENTS.ERROR)
    ) {
      const request = pendingRequests.get(requestId)!;
      clearTimeout(request.timer);
      pendingRequests.delete(requestId);
      if (type === WS_SERVER_EVENTS.ERROR) {
        const error = data as WsServerPayloads['ERROR'];
        request.reject(new Error(error.error?.code || 'No se pudo completar la acción.'));
      } else {
        request.resolve();
      }
    }
    if (type === WS_SERVER_EVENTS.GROUP_INVITATION_REJECTED) {
      earlyInvitations.delete((data as { conversationId: string }).conversationId);
    }
    if (type === WS_SERVER_EVENTS.GROUP_INVITATION && !handlers.get(type)?.size) {
      const invitation = data as WsServerPayloads['GROUP_INVITATION'];
      earlyInvitations.set(invitation.conversationId, invitation);
    }

    // Auth failures arrive as a normal ERROR message, not a socket close —
    // the server keeps the connection open even when unauthenticated.
    if (type === WS_SERVER_EVENTS.ERROR) {
      const errorData = data as WsServerPayloads[typeof WS_SERVER_EVENTS.ERROR];

      // Guard against the case where the server sends a plain string
      // instead of the expected { success, error } shape (unhandled errors)
      const message = errorData?.error?.code;

      if (message && AUTH_ERROR_MESSAGES.has(message)) {
        // SESSION_REVOKED means the session was explicitly invalidated
        // (e.g. logout elsewhere) — refresh will fail too, go straight to login
        if (message === 'WS_AUTH:SESSION_REVOKED') {
          disconnect();
          authService.logout();
          window.location.href = '/login';
          return;
        }

        handleAuthError();

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
    /**
     * Close current socket intentionally.
     *
     * handleClose() will NOT reconnect because
     * manualDisconnect is true.
     */
    disconnect();

    /**
     * Refresh the access token.
     */
    await authService.refresh();

    /**
     * connect() resets manualDisconnect.
     */
    connect(currentUrl);
  } catch (error) {
    console.error('[ws] session refresh failed', error);
    await authService.logout();
    window.location.href = '/login';
  } finally {
    reconnecting = false;
  }
}

function scheduleReconnect() {
  /**
   * Don't schedule multiple reconnects.
   */
  if (reconnectTimer) {
    return;
  }

  /**
   * Don't reconnect when the application intentionally
   * disconnected the WebSocket.
   */
  if (manualDisconnect) {
    return;
  }

  /**
   * Don't reconnect while we're already refreshing
   * the authentication session.
   */
  if (reconnecting) {
    return;
  }

  const delay = getReconnectDelay();

  console.log(`[ws] reconnecting in ${delay}ms ` + `(attempt ${reconnectAttempts + 1})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts++;

    connect(currentUrl);
  }, delay);
}

function handleClose(event: CloseEvent) {
  rejectPendingRequests();
  console.log('[ws] CLOSE', {
    code: event.code,
    reason: event.reason,
    wasClean: event.wasClean,
  });

  socket = null;

  /**
   * Intentional disconnect.
   */
  if (manualDisconnect) {
    return;
  }

  /**
   * Authentication refresh is handling the connection.
   */
  if (reconnecting) {
    return;
  }

  /**
   * Unexpected connection loss.
   */
  scheduleReconnect();
}

function handleError(event: Event) {
  console.log('[ws] ERROR', event);
}

export function connect(url: string) {
  console.log('[ws] connecting to:', url);

  /**
   * connect() means we want a connection.
   */
  manualDisconnect = false;

  /**
   * Don't create duplicate connections.
   */
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
  rejectPendingRequests();
  earlyInvitations.clear();
  console.trace('[ws] DISCONNECT');

  /**
   * Tell handleClose() that this was intentional.
   */
  manualDisconnect = true;

  /**
   * Cancel pending reconnect.
   */
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  /**
   * Reset reconnect attempts.
   */
  reconnectAttempts = 0;

  socket?.close();

  socket = null;
}

export function emit<E extends ClientEvent>(type: E, data: WsClientPayloads[E]) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type,
        data,
      }),
    );

    return;
  }

  console.warn('[ws] socket not open, event dropped:', type);
}

export function on<E extends ServerEvent>(type: E, handler: Handler<WsServerPayloads[E]>) {
  if (!handlers.has(type)) {
    handlers.set(type, new Set());
  }

  handlers.get(type)!.add(handler);
  if (type === WS_SERVER_EVENTS.GROUP_INVITATION && earlyInvitations.size) {
    const invitations = [...earlyInvitations.values()];
    earlyInvitations.clear();
    queueMicrotask(() => {
      const subscribers = handlers.get(type);
      if (!subscribers?.size) {
        for (const invitation of invitations)
          earlyInvitations.set(invitation.conversationId, invitation);
        return;
      }
      for (const invitation of invitations) {
        for (const subscriber of subscribers) subscriber(invitation);
      }
    });
  }

  return () => {
    handlers.get(type)?.delete(handler);
  };
}

export function request<
  E extends 'GROUP_INVITE_MEMBER' | 'GROUP_INVITATION_ACCEPT' | 'GROUP_INVITATION_REJECT',
>(type: E, data: WsClientPayloads[E]): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('No hay conexión. Inténtalo de nuevo.'));
  }
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('No se recibió confirmación. Inténtalo de nuevo.'));
    }, 15000);
    pendingRequests.set(requestId, { resolve, reject, timer });
    try {
      socket!.send(JSON.stringify({ type, data, requestId }));
    } catch (error) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      reject(error);
    }
  });
}

export const wsClient = {
  request,
  connect,
  disconnect,
  emit,
  on,
};
