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
