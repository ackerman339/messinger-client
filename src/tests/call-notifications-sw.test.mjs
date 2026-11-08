import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let moduleId = 0;
const callId = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
async function loadWorker(t, clients, registration = {}) {
  const previousSelf = globalThis.self;
  const handlers = new Map();
  globalThis.self = {
    skipWaiting() {},
    addEventListener: (event, callback) => handlers.set(event, callback),
    clients,
    registration,
  };
  t.after(() => {
    globalThis.self = previousSelf;
  });
  const source = fs
    .readFileSync(new URL('../sw.ts', import.meta.url), 'utf8')
    .replace(/import \{ clientsClaim \}[^;]+;/, 'const clientsClaim = () => {};')
    .replace(/import \{ precacheAndRoute \}[^;]+;/, 'const precacheAndRoute = () => {};');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${moduleId++}`
  );
  return handlers;
}

async function dispatchNotificationClick(t, clients, type, action = '') {
  const handlers = await loadWorker(t, clients);
  const pending = [];
  let closed = false;
  handlers.get('notificationclick')({
    action,
    notification: {
      data: { type, callId },
      close() {
        closed = true;
      },
    },
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
  assert.ok(closed);
}

for (const type of ['call-incoming', 'call-missed']) {
  test(`${type} click focuses the existing chat without navigation`, async (t) => {
    let focused = 0;
    const chat = {
      url: 'https://messinger.test/chat?conversationId=current',
      focus: async () => {
        focused++;
      },
      navigate: () => assert.fail('must preserve the selected WebSocket'),
      postMessage: (data, ports) => {
        assert.equal(type, 'call-incoming');
        assert.deepEqual(data, { type: 'CALL_NOTIFICATION_ACTION', callId, action: 'accept' });
        ports[0].postMessage({ type: 'CALL_NOTIFICATION_RECEIVED', callId, action: 'accept' });
      },
    };
    await dispatchNotificationClick(
      t,
      {
        matchAll: async () => [{ url: 'https://messinger.test/sign-in' }, chat],
        openWindow: () => assert.fail('chat is already open'),
      },
      type,
    );
    assert.equal(focused, 1);
  });
}

test('call notification opens chat when no chat window exists', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    'call-missed',
  );
  assert.deepEqual(opened, ['/chat']);
});

async function dispatchPush(t, payload, registration) {
  const handlers = await loadWorker(t, {}, registration);
  const pending = [];
  t.mock.method(console, 'log', () => {});
  handlers.get('push')({
    data: { json: () => payload },
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
}

test('incoming call push stays visible and uses the same tag as local notifications', async (t) => {
  const shown = [];
  await dispatchPush(
    t,
    {
      title: 'Llamada entrante',
      body: 'Tienes una llamada de voz entrante.',
      data: {
        type: 'call-incoming',
        callId: 'call',
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      },
    },
    { showNotification: async (...args) => shown.push(args) },
  );
  assert.equal(shown.length, 1);
  assert.equal(shown[0][1].tag, 'messinger:call-incoming:call');
  assert.equal(shown[0][1].requireInteraction, true);
  assert.notEqual(shown[0][1].renotify, true);
  assert.deepEqual(shown[0][1].actions, [
    { action: 'accept', title: 'Aceptar' },
    { action: 'reject', title: 'Rechazar' },
  ]);
});

test('missed call push closes the previous incoming notification', async (t) => {
  let closed = false;
  const shown = [];
  await dispatchPush(
    t,
    {
      title: 'Llamada perdida',
      body: 'Sin contestar',
      data: { type: 'call-missed', callId: 'call' },
    },
    {
      getNotifications: async ({ tag }) => {
        assert.equal(tag, 'messinger:call-incoming:call');
        return [
          {
            close() {
              closed = true;
            },
          },
        ];
      },
      showNotification: async (...args) => shown.push(args),
    },
  );
  assert.ok(closed);
  assert.equal(shown[0][1].tag, 'messinger:call-missed:call');
  assert.equal(shown[0][1].actions, undefined);
});

test('clicking a stale notice still carries only the call ID for fresh server validation', async (t) => {
  const handlers = await loadWorker(t, {
    matchAll: async () => [],
    openWindow: async (url) => opened.push(url),
  });
  const opened = [];
  const pending = [];
  handlers.get('notificationclick')({
    action: 'accept',
    notification: {
      data: { type: 'call-incoming', callId, expiresAt: new Date(0).toISOString() },
      close() {},
    },
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
  assert.deepEqual(opened, [`/chat?answerCall=${callId}`]);
});

test('regular message push keeps its original notification behavior', async (t) => {
  const shown = [];
  await dispatchPush(
    t,
    {
      title: 'Contacto',
      body: 'Mensaje',
      data: { type: 'message', conversationId: 'chat' },
    },
    { showNotification: async (...args) => shown.push(args) },
  );
  assert.equal(shown[0][0], 'Contacto');
  assert.equal(shown[0][1].body, 'Mensaje');
  assert.equal(shown[0][1].tag, undefined);
});

test('incoming notification opens a cold-start URL carrying the answer intent', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
    'call-incoming',
    'accept',
  );
  assert.deepEqual(opened, [`/chat?answerCall=${callId}`]);
});
test('a chat without a notification listener is preserved and a cold-start window is opened', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [
        {
          url: 'https://messinger.test/chat',
          focus: async () => {},
          postMessage() {
            throw new Error('unavailable');
          },
        },
      ],
      openWindow: async (url) => opened.push(url),
    },
    'call-incoming',
    'accept',
  );
  assert.deepEqual(opened, [`/chat?answerCall=${callId}`]);
});

test('a loading chat that does not acknowledge falls back without reloading that tab', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [
        {
          url: 'https://messinger.test/chat',
          focus: async () => {},
          postMessage() {},
          navigate: () => assert.fail('must not reload'),
        },
      ],
      openWindow: async (url) => opened.push(url),
    },
    'call-incoming',
    'accept',
  );
  assert.deepEqual(opened, [`/chat?answerCall=${callId}`]);
});

for (const action of ['accept', 'reject']) {
  test(`${action} is delivered to the existing chat without navigating`, async (t) => {
    let focused = 0;
    const delivered = [];
    await dispatchNotificationClick(
      t,
      {
        matchAll: async () => [
          {
            url: 'https://messinger.test/chat',
            focus: async () => {
              focused++;
            },
            navigate: () => assert.fail('must not reload'),
            postMessage: (data, ports) => {
              delivered.push(data);
              ports[0].postMessage({ type: 'CALL_NOTIFICATION_RECEIVED', callId, action });
            },
          },
        ],
        openWindow: () => assert.fail('existing chat acknowledged the action'),
      },
      'call-incoming',
      action,
    );
    assert.deepEqual(delivered, [{ type: 'CALL_NOTIFICATION_ACTION', callId, action }]);
    assert.equal(focused, action === 'accept' ? 1 : 0);
  });
}
test('reject opens a cold-start URL when the app is closed', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    'call-incoming',
    'reject',
  );
  assert.deepEqual(opened, [`/chat?rejectCall=${callId}`]);
});
test('clicking the incoming notification body opens chat with the answer intent', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    'call-incoming',
  );
  assert.deepEqual(opened, [`/chat?answerCall=${callId}`]);
});
test('missed notifications cannot accept or reject a call', async (t) => {
  const opened = [];
  await dispatchNotificationClick(
    t,
    {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    'call-missed',
    'accept',
  );
  assert.deepEqual(opened, ['/chat']);
});
