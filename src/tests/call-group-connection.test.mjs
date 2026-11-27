import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadGroupModule(file, sdk, imports = {}) {
  const source = readFileSync(
    new URL(`../group-calls/${file}.ts`, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (name) => {
      if (name in imports) return imports[name];
      assert.equal(name, 'livekit-client');
      return sdk;
    },
    module,
    module.exports,
  );
  return module.exports;
}

const ConnectionErrorReason = { InternalError: 2, NotAllowed: 0 };
class ConnectionError extends Error {
  constructor(message, reason = ConnectionErrorReason.InternalError) {
    super(message);
    this.reason = reason;
  }
}
const { connectGroupRoom } = loadGroupModule('room-platform', {
  ConnectionError,
  ConnectionErrorReason,
});

test('group calls retry a peer connection timeout once using the signaled TURN servers', async () => {
  const attempts = [];
  const room = {
    async connect(url, token, options) {
      attempts.push({ url, token, options });
      if (attempts.length === 1)
        throw new ConnectionError('could not establish pc connection');
    },
  };
  const relayNotifications = [];
  await connectGroupRoom(
    room,
    'ws://local-livekit',
    'fixture',
    new AbortController().signal,
    () => relayNotifications.push(true),
  );
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1], {
    url: 'ws://local-livekit',
    token: 'fixture',
    options: { rtcConfig: { iceTransportPolicy: 'relay' } },
  });
  assert.equal(relayNotifications.length, 1);
});

test('group calls keep authorization errors and stop when cancelled during the first attempt', async () => {
  const abort = new AbortController();
  const room = {
    async connect() {
      throw new ConnectionError('denied', ConnectionErrorReason.NotAllowed);
    },
  };
  const unexpectedRetry = () => assert.fail('unexpected TURN retry');
  await assert.rejects(
    connectGroupRoom(
      room,
      'ws://local-livekit',
      'fixture',
      abort.signal,
      unexpectedRetry,
    ),
    /denied/,
  );
  room.connect = async () => {
    abort.abort();
    throw new ConnectionError('could not establish pc connection');
  };
  await connectGroupRoom(
    room,
    'ws://local-livekit',
    'fixture',
    abort.signal,
    unexpectedRetry,
  );
});

test('cancelling a group call releases a microphone granted after the permission prompt', async () => {
  const abort = new AbortController();
  const requested = Promise.withResolvers();
  const permission = Promise.withResolvers();
  const { prepareGroupMedia } = loadGroupModule('group-media', {
    createLocalAudioTrack() {
      requested.resolve();
      return permission.promise;
    },
    createLocalVideoTrack: () => assert.fail('camera requested after cancellation'),
  });
  const pending = prepareGroupMedia(true, abort.signal);
  await requested.promise;
  abort.abort();
  assert.deepEqual(await pending, { tracks: [], failed: [] });

  let stopped = false;
  permission.resolve({
    stop: () => {
      stopped = true;
    },
  });
  await permission.promise;
  assert.equal(stopped, true);
});

test('group recovery rejoins the same call with fresh credentials and leaves muted media disabled', async () => {
  const call = { id: 'group-call', conversationId: 'group', media: 'video' };
  const restored = [];
  const abort = new AbortController();
  const { recoverGroupRoom } = loadGroupModule('group-room-recovery', {
    ConnectionState: { Disconnected: 'disconnected' },
  }, {
    axios: { isAxiosError: () => false },
    './api': {
      groupCallApi: {
        async join(target, fromNotification, signal) {
          assert.deepEqual(target, call);
          assert.equal(fromNotification, false);
          assert.equal(signal, abort.signal);
          return { url: 'wss://livekit', token: 'fresh-token' };
        },
      },
    },
  });
  const room = {
    state: 'disconnected',
    localParticipant: {
      async setMicrophoneEnabled() { assert.fail('disabled microphone was restored'); },
      async setCameraEnabled(enabled) { restored.push(enabled); },
    },
  };
  await recoverGroupRoom(room, call, { microphone: false, camera: true }, abort.signal, async (url, token) => {
    assert.deepEqual([url, token], ['wss://livekit', 'fresh-token']);
    room.state = 'connected';
  });
  assert.deepEqual(restored, [true]);
  abort.abort();
  await recoverGroupRoom(room, call, { microphone: false, camera: true }, abort.signal, async () => {
    assert.fail('a cancelled call rejoined');
  });
});
