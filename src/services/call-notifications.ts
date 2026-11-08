import type { CallView } from '../state/call-session';

export type CallNotificationPermission = NotificationPermission | 'unsupported';

type NotificationHandle = { close: () => void };
type CallNotificationKind = 'call-incoming' | 'call-missed';

export function getCallNotificationPermission(): CallNotificationPermission {
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

async function showCallNotification(
  kind: CallNotificationKind,
  call: CallView & { callId: string },
  onAnswer?: (callId: string) => void,
): Promise<NotificationHandle | undefined> {
  if (getCallNotificationPermission() !== 'granted') return;

  const incoming = kind === 'call-incoming';
  const title = incoming ? 'Llamada entrante' : 'Llamada perdida';
  const media = call.media === 'video' ? 'videollamada' : 'llamada de voz';
  const tag = `messinger:${kind}:${call.callId}`;
  const options: NotificationOptions = {
    body: incoming ? `Tienes una ${media}. Pulsa para atender.` : `No contestaste una ${media}.`,
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    tag,
    requireInteraction: incoming,
    silent: incoming, // The incoming call already has its own ringtone.
    data: { type: kind, callId: call.callId },
  };

  try {
    // getRegistration also works in development without waiting indefinitely for a worker.
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;

    if (registration?.active) {
      await registration.showNotification(title, {
        ...options,
        ...(incoming && {
          actions: [
            { action: 'accept', title: 'Aceptar' },
            { action: 'reject', title: 'Rechazar' },
          ],
        }),
      });
      return {
        close: () => {
          void registration
            .getNotifications({ tag })
            .then((notifications) => notifications.forEach((notification) => notification.close()))
            .catch(() => {});
        },
      };
    }
  } catch {
    // Desktop browsers can still use nonpersistent notifications if the worker is unavailable.
  }

  try {
    const notification = new Notification(title, options);
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      notification.close();
      if (incoming) onAnswer?.(call.callId);
    };
    return { close: () => notification.close() };
  } catch {
    // Denied permission or unsupported constructors must not interrupt the call.
    return undefined;
  }
}

/** Observes call state and manages incoming and missed notifications. */
export function createCallNotifications(onAnswer?: (callId: string) => void) {
  const incomingShown = new Set<string>();
  const incomingPending = new Set<string>();
  const missedShown = new Set<string>();
  const handles = new Set<NotificationHandle>();
  let active = true;
  let ringingId: string | undefined;
  let ringingHandle: NotificationHandle | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function closeIncoming() {
    clearTimeout(expiryTimer);
    ringingId = undefined;
    if (ringingHandle) {
      ringingHandle.close();
      handles.delete(ringingHandle);
      ringingHandle = undefined;
    }
  }

  function update(call: CallView | null) {
    if (!active) return;
    const ringing =
      call?.incoming &&
      call.status === 'ringing' &&
      !call.answering &&
      (!call.expiresAt || Date.parse(call.expiresAt) > Date.now());
    const nextId = ringing ? call.callId : undefined;
    if (ringingId !== nextId) {
      closeIncoming();
      ringingId = nextId;
      if (nextId && call?.expiresAt) {
        expiryTimer = setTimeout(
          closeIncoming,
          Math.max(0, Date.parse(call.expiresAt) - Date.now()),
        );
      }
    }
    if (getCallNotificationPermission() !== 'granted') {
      closeIncoming();
      return;
    }
    if (!call?.incoming || !call.callId) return;
    const callId = call.callId;
    const notificationCall = { ...call, callId };

    if (ringing && !incomingShown.has(callId) && !incomingPending.has(callId)) {
      incomingPending.add(callId);
      void showCallNotification('call-incoming', notificationCall, onAnswer).then((handle) => {
        incomingPending.delete(callId);
        if (!handle) return;
        if (!active || ringingId !== callId) {
          handle.close();
          return;
        }
        incomingShown.add(callId);
        ringingHandle = handle;
        handles.add(handle);
      });
    }
    if (call.status === 'missed' && !missedShown.has(callId)) {
      missedShown.add(callId);
      void showCallNotification('call-missed', notificationCall).then((handle) => {
        if (!handle) {
          missedShown.delete(callId);
          return;
        }
        if (!active) handle.close();
        else handles.add(handle);
      });
    }
  }

  function dispose() {
    active = false;
    closeIncoming();
    handles.forEach((handle) => handle.close());
    handles.clear();
  }

  return { update, dispose };
}
