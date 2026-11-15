import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL('../components/chat/header-button.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'header-button.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture({
  type = 'PRIVATE',
  empty = async () => {},
  request = async () => {},
} = {}) {
  const requests = [],
    emptied = [],
    cleared = [],
    notices = [],
    state = [];
  const conversation = {
    id: 'chat',
    type,
    members: [{ userId: 'alice' }, { userId: 'bob' }],
  };
  const dependencies = {
    react: {
      useRef: (current) => ({ current }),
      useState: (initial) => {
        const index = state.length;
        state.push(initial);
        return [
          initial,
          (value) => {
            state[index] = value;
            if (value?.title) notices.push(value);
          },
        ];
      },
    },
    '@/context/chat-context': {
      useChatContext: () => ({
        activeConversation: conversation,
        handleEmptyChat: (id) => cleared.push(id),
      }),
    },
    '@/context/user-context': {
      useUserContext: () => ({ user: { id: 'alice', username: 'Ana' } }),
    },
    '@/services/conversation': {
      conversationService: {
        requestUserConnection: async (data) => {
          requests.push(data);
          await request();
        },
        emptyMessages: async (data) => {
          emptied.push(data);
          await empty();
        },
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => (name in dependencies ? dependencies[name] : require(name)),
    module,
    module.exports,
  );
  const tree = module.exports.HeaderButton();
  const action = (label) => {
    const node = nodes(tree).find(
      (node) => node.props?.['aria-label'] === label,
    );
    return node?.props.onSelect ?? node?.props.onClick;
  };
  return { action, requests, emptied, cleared, notices, state, conversation };
}
test('private header sends the request to the other participant and reports success', async () => {
  const f = fixture();
  await f.action('Solicitar que se conecte')();
  assert.deepEqual(f.requests, [
    { senderName: 'Ana', targetUserId: 'bob', conversationId: 'chat' },
  ]);
  assert.equal(f.notices[0].title, 'Solicitud enviada');
});
test('emptying a chat waits for confirmation and clears it only after the API succeeds', async () => {
  const f = fixture();
  f.action('Vaciar chat')();
  assert.equal(f.state[2], true);
  assert.deepEqual(f.emptied, []);
  assert.deepEqual(f.cleared, []);
  await f.action('Confirmar vaciado')();
  assert.deepEqual(f.emptied, [{ conversationId: 'chat' }]);
  assert.deepEqual(f.cleared, ['chat']);
});
test('failed emptying preserves the local history and reports the error', async () => {
  const f = fixture({
    empty: async () => {
      throw new Error('network');
    },
  });
  await f.action('Confirmar vaciado')();
  assert.deepEqual(f.cleared, []);
  assert.equal(f.notices[0].title, 'No se pudo vaciar el chat');
  assert.equal(f.notices[0].error, true);
});
test('failed connection requests report the error and release the pending action', async () => {
  const f = fixture({
    request: async () => {
      throw new Error('network');
    },
  });
  await f.action('Solicitar que se conecte')();
  assert.equal(f.notices[0].title, 'No se pudo enviar la solicitud');
  assert.equal(f.state[1], false);
});
test('groups offer emptying without targeting a member for connection requests', () => {
  const f = fixture({ type: 'GROUP' });
  assert.equal(f.action('Solicitar que se conecte'), undefined);
  assert.equal(typeof f.action('Vaciar chat'), 'function');
});
test('concurrent clicks do not send the same connection request twice', async () => {
  let resolve;
  const f = fixture({
    request: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const first = f.action('Solicitar que se conecte')();
  await f.action('Solicitar que se conecte')();
  assert.equal(f.requests.length, 1);
  resolve();
  await first;
});
test('completing a pending empty action clears the captured conversation only', async () => {
  let resolve;
  const f = fixture({
    empty: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const pending = f.action('Confirmar vaciado')();
  f.conversation.id = 'another-chat';
  resolve();
  await pending;
  assert.deepEqual(f.cleared, ['chat']);
});
