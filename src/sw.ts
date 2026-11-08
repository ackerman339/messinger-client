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

  const { type, conversationId } = event.notification.data ?? {};

  if (type === 'call-incoming' || type === 'call-missed') {
    event.waitUntil(openOrFocusCallWindow());
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
async function openOrFocusCallWindow() {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const chatClient = windowClients.find((client) => new URL(client.url).pathname === '/chat');
  if (chatClient) {
    await chatClient.focus();
    return;
  }
  await self.clients.openWindow('/chat');
}

interface CallPushPayload {
  title: string;
  body: string;
  icon?: string;
  data: { type: 'call-incoming' | 'call-missed'; callId: string; expiresAt?: string | null };
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

  await self.registration.showNotification(title, {
    body,
    icon,
    data,
    tag: `messinger:${data.type}:${data.callId}`,
    requireInteraction: incoming,
  });
}
