import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const mobile = existsSync(new URL('../components/messages-list.tsx', import.meta.url));
const prefix = mobile ? '@/src/' : '@/';
const source = readFileSync(new URL('../services/forward-message.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
});

function fixture() {
  const queued = [];
  const copied = [];

  const dependencies = {
    [prefix + 'services/files']: {
      fileService: {
        async prepareForward(attachmentIds) {
          copied.push(...attachmentIds);
          return [
            { id: 'new-upload-id', fileName: 'voicenote.m4a', contentType: 'audio/mp4', size: 4 },
          ];
        },
      },
    },
    [prefix + 'services/message-sync']: {
      messageSync: {
        enqueue: (userId, payload) => {
          queued.push({ userId, ...payload });
          return true;
        },
      },
    },
    [prefix + 'types/websocket']: {
      WS_CLIENT_EVENTS: {
        SEND_GROUP_MESSAGE: 'SEND_GROUP_MESSAGE',
        SEND_PRIVATE_MESSAGE: 'SEND_PRIVATE_MESSAGE',
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (name) => dependencies[name],
    module,
    module.exports,
  );
  return { forward: module.exports.forwardMessage, queued, copied };
}

const destination = {
  id: 'target-chat',
  type: 'PRIVATE',
  members: [{ userId: 'me' }, { userId: 'friend' }],
};

test('forwarding sends a new message and omits the source reply and sender', async () => {
  const f = fixture();
  const message = {
    senderId: 'other',
    content: 'Hola',
    attachments: [],
    reply: { messageId: 'source-id' },
  };
  assert.equal(await f.forward('me', destination, message), true);
  assert.deepEqual(f.queued, [
    {
      userId: 'me',
      type: 'SEND_PRIVATE_MESSAGE',
      data: {
        receiverId: 'friend',
        content: 'Hola',
        attachments: [],
        location: undefined,
        forwarded: true,
      },
    },
  ]);
});

test('forwarding an attachment uses the copy authorized by the server', async () => {
  const f = fixture();
  const attachment = {
    id: 'original-id',
    fileName: 'voicenote.m4a',
    contentType: 'audio/mp4',
    size: 4,
  };
  const sent = await f.forward(
    'me',
    { id: 'group', type: 'GROUP', members: [{ userId: 'me' }] },
    { content: 'Nota de voz', attachments: [attachment] },
  );
  assert.equal(sent, true);
  assert.deepEqual(f.copied, ['original-id']);
  assert.equal(f.queued[0].data.attachments[0].id, 'new-upload-id');
});

test('forwarding live location sends a static snapshot', async () => {
  const f = fixture();
  const point = { latitude: 4.61, longitude: -74.1, capturedAt: 1000 };
  await f.forward('me', destination, {
    content: 'Ubicación en tiempo real',
    attachments: [],
    location: { ...point, expiresAt: 2000 },
  });
  assert.deepEqual(f.queued[0].data.location, point);
  assert.equal(f.queued[0].data.content, 'Ubicación compartida');
});
