/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  console.log('[SW] PUSH RECEIVED', event.data);

  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  const { title, body, icon, data } = payload;

  console.log('AAAA', data);
  if (data?.type === 'call-incoming' || data?.type === 'call-missed') {
    console.log('BBBB');

    event.waitUntil(showCallPushNotification({ title, body, icon, data }));
    return;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      data,

      ...(data?.type === 'request-connection' && {
        requireInteraction: true,
        vibrate: [0, 300, 100, 300, 100, 300],
        actions: [
          {
            action: 'accept',
            title: 'Aceptar',
          },
          {
            action: 'reject',
            title: 'Rechazar',
          },
        ],
      }),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { type, conversationId, callId } = event.notification.data ?? {};

  if (type === 'call-incoming' || type === 'call-missed') {
    const action =
      type === 'call-incoming' &&
      (event.action === '' || event.action === 'accept' || event.action === 'reject')
        ? event.action === 'reject'
          ? 'reject'
          : 'accept'
        : undefined;
    event.waitUntil(openOrFocusCallWindow(action ? callId : undefined, action));
    return;
  }

  if (type === 'request-connection') {
    event.waitUntil(
      handleConnectRequest({
        action: event.action,
        conversationId,
      }),
    );

    return;
  }

  const url = `/chat?conversationId=${encodeURIComponent(conversationId)}`;
  event.waitUntil(openOrFocusWindow(url));
});

async function handleConnectRequest({
  action,
  conversationId,
}: {
  action: string;
  conversationId: string;
}) {
  const url = `/chat?conversationId=${encodeURIComponent(conversationId)}`;

  if (action === 'accept') {
    await openOrFocusWindow(url);
    return;
  }

  if (action === 'reject') {
    return;
  }

  await openOrFocusWindow(url);
}

async function openOrFocusWindow(url: string) {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  if (windowClients.length > 0) {
    const client = windowClients[0];
    await client.focus();

    if ('navigate' in client) {
      await client.navigate(url);
    }

    return;
  }

  await self.clients.openWindow(url);
}

// Focusing the current chat preserves its selected WebSocket and active peer.
async function openOrFocusCallWindow(callId?: string, action?: 'accept' | 'reject') {
  const validCallId =
    typeof callId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId);
  const parameter = action === 'reject' ? 'rejectCall' : 'answerCall';
  const url = validCallId && action ? `/chat?${parameter}=${encodeURIComponent(callId)}` : '/chat';
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const chatClients = windowClients.filter((client) => new URL(client.url).pathname === '/chat');
  const chatClient = chatClients.find((client) => client.focused) ?? chatClients[0];
  if (chatClient) {
    if (action !== 'reject') await chatClient.focus();
    if (!validCallId || !action || (await deliverCallAction(chatClient, callId, action))) return;
    // A tab still loading may not have the listener yet. Preserve it and open a cold-start URL.
  }
  await self.clients.openWindow(url);
}

function deliverCallAction(
  client: WindowClient,
  callId: string,
  action: 'accept' | 'reject',
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (received: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(received);
    };
    const timeout = setTimeout(() => finish(false), 1200);
    channel.port1.onmessage = (event) => {
      if (
        event.data?.type === 'CALL_NOTIFICATION_RECEIVED' &&
        event.data.callId === callId &&
        event.data.action === action
      )
        finish(true);
    };
    try {
      client.postMessage({ type: 'CALL_NOTIFICATION_ACTION', callId, action }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

interface CallPushPayload {
  title: string;
  body: string;
  icon?: string;
  data: { type: 'call-incoming' | 'call-missed'; callId: string; callerName?: string; expiresAt?: string | null };
}

async function showCallPushNotification({ title, body, icon, data }: CallPushPayload) {
  const incoming = data.type === 'call-incoming';
  //if (incoming && data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) return;

  if (!incoming) {
    // A missed call replaces its ringing notice, including notices shown by an open tab.
    const ringing = await self.registration
      .getNotifications({
        tag: `messinger:call-incoming:${data.callId}`,
      })
      .catch(() => []);
    for (const notification of ringing) notification.close();
  }

  const callerName = typeof data.callerName === 'string' ? data.callerName.trim().slice(0, 100) : '';
  const notificationTitle = incoming
    ? (callerName || title)
    : (callerName ? `Llamada perdida de ${callerName}` : title);
  await self.registration.showNotification(notificationTitle, {
    body,
    icon,
    data,
    tag: `messinger:${data.type}:${data.callId}`,
    requireInteraction: incoming,
    ...(incoming && {
      actions: [
        { action: 'accept', title: 'Aceptar' },
        { action: 'reject', title: 'Rechazar' },
      ],
    }),
  });
}
