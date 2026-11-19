/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  const { title, body, icon, data } = payload;

  if (data?.type === 'call-incoming' || data?.type === 'call-missed' ||
    data?.type === 'group-call-incoming' || data?.type === 'group-call-missed' || data?.type === 'group-call-closed') {
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

  if (type === 'group-call-missed') {
    event.waitUntil(openOrFocusWindow(`/chat?conversationId=${encodeURIComponent(conversationId)}`));
    return;
  }

  if (type === 'group-call-incoming') {
    if (event.action && event.action !== 'accept' && event.action !== 'reject') return;
    const { media, groupName, expiresAt } = event.notification.data;
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return;
    event.waitUntil(openOrFocusCallWindow(callId, event.action === 'reject' ? 'reject' : 'accept', {
      conversationId, media, groupName,
    }));
    return;
  }

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
type GroupCallRouting = { conversationId: string; media?: 'audio' | 'video'; groupName?: string };

async function openOrFocusCallWindow(callId?: string, action?: 'accept' | 'reject', group?: GroupCallRouting) {
  const validCallId =
    typeof callId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId);
  const parameter = group
    ? (action === 'reject' ? 'rejectGroupCall' : 'answerGroupCall')
    : (action === 'reject' ? 'rejectCall' : 'answerCall');
  const route = new URLSearchParams();
  if (validCallId && action) route.set(parameter, callId);
  if (validCallId && action && group) {
    route.set('groupCallConversation', group.conversationId);
    route.set('groupCallMedia', group.media ?? 'audio');
  }
  const url = route.size ? `/chat?${route}` : '/chat';
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const chatClients = windowClients.filter((client) => new URL(client.url).pathname === '/chat');
  const chatClient = chatClients.find((client) => client.focused) ?? chatClients[0];
  if (chatClient) {
    if (action !== 'reject') await chatClient.focus();
    if (!validCallId || !action || (await deliverCallAction(chatClient, callId, action, group))) return;
    // A tab still loading may not have the listener yet. Preserve it and open a cold-start URL.
  }
  await self.clients.openWindow(url);
}

function deliverCallAction(
  client: WindowClient,
  callId: string,
  action: 'accept' | 'reject',
  group?: GroupCallRouting,
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
      client.postMessage({ type: group ? 'GROUP_CALL_NOTIFICATION_ACTION' : 'CALL_NOTIFICATION_ACTION', callId, action, ...group }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

interface CallPushPayload {
  title: string;
  body: string;
  icon?: string;
  data: {
    type: 'call-incoming' | 'call-missed' | 'group-call-incoming' | 'group-call-missed' | 'group-call-closed';
    callId: string; callerName?: string; expiresAt?: string | null;
  };
}

async function showCallPushNotification({ title, body, icon, data }: CallPushPayload) {
  const group = data.type.startsWith('group-');
  const incoming = data.type === 'call-incoming' || data.type === 'group-call-incoming';
  if (group && incoming && data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) return;
  //if (incoming && data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) return;

  if (!incoming) {
    // A missed call replaces its ringing notice, including notices shown by an open tab.
    const ringing = await self.registration
      .getNotifications({
        tag: `messinger:${group ? 'group-' : ''}call-incoming:${data.callId}`,
      })
      .catch(() => []);
    for (const notification of ringing) notification.close();
    if (data.type === 'group-call-closed') return;
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
