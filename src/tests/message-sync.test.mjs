import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function fixture(t, storage = new Map()) {
  const localStorage = {
    get length() {
      return storage.size;
    },
    key: (index) => [...storage.keys()][index],
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const modules = new Map();
  function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'localStorage', outputText)(
      (path) => load(new URL(`${path}.ts`, url)),
      module,
      module.exports,
      localStorage,
    );
    modules.set(url.href, module.exports);
    return module.exports;
  }
  const sync = load(new URL('../services/message-sync.ts', import.meta.url));
  t.after(sync.messageSync.disconnected);
  const frames = [];
  return {
    ...sync,
    frames,
    connect: (user) => sync.messageSync.authenticated(user, (entry) => frames.push(entry)),
  };
}

const privateMessage = {
  type: 'SEND_PRIVATE_MESSAGE',
  data: { receiverId: 'alice', content: 'Hola', attachments: [] },
};
const groupMessage = {
  type: 'SEND_GROUP_MESSAGE',
  data: { conversationId: 'team', content: 'Equipo', attachments: [] },
};

test('queued private and group messages survive restart and wait for authentication of the owner', (t) => {
  const disk = new Map();
  const initial = fixture(t, disk);
  initial.messageSync.setAccount('sender');
  assert.equal(initial.messageSync.enqueue('sender', privateMessage), true);
  assert.equal(initial.messageSync.enqueue('sender', groupMessage), true);
  assert.equal(initial.frames.length, 0);
  const ids = initial.messageSync.getSnapshot().pending.map(({ id }) => id);

  const resumed = fixture(t, disk);
  resumed.messageSync.setAccount('another-user');
  resumed.connect('another-user');
  assert.equal(resumed.frames.length, 0);
  assert.deepEqual(resumed.messageSync.getSnapshot().pending, []);
  resumed.messageSync.setAccount('sender');
  assert.equal(resumed.frames.length, 0);
  resumed.connect('sender');
  assert.deepEqual(
    resumed.frames.map(({ type, data }) => [type, data.receiverId, data.clientMessageId]),
    [['SEND_PRIVATE_MESSAGE', 'alice', ids[0]]],
  );
  resumed.messageSync.acknowledge('MESSAGE_SENT', { senderId: 'sender', clientMessageId: ids[0] });
  assert.equal(resumed.frames[1].data.conversationId, 'team');
  assert.equal(resumed.frames[1].data.clientMessageId, ids[1]);
  resumed.messageSync.acknowledge('MESSAGE_SENT', { senderId: 'sender', clientMessageId: ids[1] });
  assert.equal(disk.size, 0);
});

test('lost acknowledgements retry the same ID and a permanent rejection releases the queue', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { messageSync, frames, connect } = fixture(t);
  messageSync.setAccount('sender');
  connect('sender');
  messageSync.enqueue('sender', privateMessage);
  messageSync.enqueue('sender', groupMessage);
  t.mock.timers.tick(12_000);
  assert.equal(frames[0].id, frames[1].id);
  messageSync.acknowledge('ERROR', { error: { code: 'VALIDATION_ERROR' } }, frames[0].id);
  assert.equal(messageSync.getSnapshot().pending[0].failed, true);
  assert.equal(frames[2].type, 'SEND_GROUP_MESSAGE');
});

test('receipts are processed independently of a pending send and duplicate deliveries are ignored', (t) => {
  const { messageSync, frames, connect } = fixture(t);
  messageSync.setAccount('sender');
  connect('sender');
  messageSync.enqueue('sender', privateMessage);
  const incoming = { id: 'incoming', conversationId: 'team', senderId: 'alice', type: 'MESSAGE' };
  assert.equal(messageSync.acknowledge('NEW_MESSAGE', incoming), true);
  assert.equal(messageSync.acknowledge('NEW_MESSAGE', incoming), false);
  messageSync.receipt(incoming, 'READ');
  assert.equal(frames[1].type, 'MESSAGE_DELIVERED');
  messageSync.acknowledge('MESSAGE_RECEIPT_CONFIRMED', frames[1].data, frames[1].id);
  assert.equal(frames[2].type, 'MESSAGE_READ');
  assert.equal(messageSync.getSnapshot().pending.length, 1);
});

test('a late notification cannot regress a receipt and group status reflects every recipient', (t) => {
  const { messageSync, getDeliveryStatus, connect } = fixture(t);
  messageSync.setAccount('sender');
  connect('sender');
  const update = (userId, status) =>
    messageSync.acknowledge('MESSAGE_STATUS_UPDATED', { messageId: 'one', userId, status });
  const initial = [
    { userId: 'alice', status: 'SENT' },
    { userId: 'bob', status: 'SENT' },
  ];
  const current = () => getDeliveryStatus(initial, messageSync.getSnapshot().updates.get('one'));
  update('alice', 'READ');
  update('alice', 'DELIVERED');
  assert.equal(current(), 'SENT');
  update('bob', 'DELIVERED');
  assert.equal(current(), 'DELIVERED');
  update('bob', 'READ');
  assert.equal(current(), 'READ');
});

test('an offline location keeps the confirmed point and starts live updates only after MESSAGE_SENT', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  const { messageSync, frames } = fixture(t);
  const account = 'sender';
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  let watch;
  let stopped = false;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition(callback) { watch = callback; return 1; },
      clearWatch() { stopped = true; },
    },
  });
  t.after(() => {
    messageSync.setAccount();
    if (descriptor) Object.defineProperty(navigator, 'geolocation', descriptor);
    else delete navigator.geolocation;
  });
  const location = { latitude: 4.6, longitude: -74.07, capturedAt: Date.now(), expiresAt: Date.now() + 900_000 };
  messageSync.setAccount(account);
  assert.equal(messageSync.enqueue(account, {
    ...privateMessage,
    data: { ...privateMessage.data, location },
  }), true);
  assert.equal(watch, undefined);

  const locations = [];
  const connect = () => messageSync.authenticated(account, (frame) => frames.push(frame), (update) => {
    locations.push(update);
    return true;
  });
  connect();
  const queuedId = frames[0].id;
  assert.deepEqual(frames[0].data.location, location);
  assert.equal(watch, undefined);
  const message = { id: 'live-id', clientMessageId: queuedId, senderId: account, location };
  messageSync.acknowledge('MESSAGE_SENT', message);
  assert.equal(typeof watch, 'function');

  messageSync.disconnected();
  t.mock.timers.tick(1000);
  watch({ coords: { latitude: 4.601, longitude: -74.07 }, timestamp: Date.now() });
  t.mock.timers.tick(1000);
  watch({ coords: { latitude: 4.602, longitude: -74.07 }, timestamp: Date.now() });
  assert.equal(locations.length, 0);
  connect();
  assert.equal(locations.length, 1);
  assert.equal(locations[0].point.latitude, 4.602);

  messageSync.disconnected();
  assert.equal(messageSync.stopLocation(message), true);
  assert.equal(stopped, true);
  assert.ok(messageSync.getSnapshot().locations.get(message.id).stoppedAt);
  connect();
  assert.equal(frames.at(-1).type, 'LOCATION_STOP');
  messageSync.acknowledge('LOCATION_STOP_CONFIRMED', { messageId: message.id }, frames.at(-1).id);
});
