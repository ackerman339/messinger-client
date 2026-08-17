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
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { conversationId } = event.notification.data ?? {};

  if (!conversationId) {
    return;
  }

  const url = `/chat?conversationId=${encodeURIComponent(conversationId)}`;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Messinger ya está abierto.
      if (windowClients.length > 0) {
        const client = windowClients[0];

        await client.focus();

        await client.navigate(url);

        return;
      }

      // Messinger está cerrado.
      await self.clients.openWindow(url);
    })(),
  );
});
