import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL('../components/chat/message-list.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'message-list.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

test('history deletion removes the corresponding call cards immediately and preserves other messages', () => {
  let items = [
    { id: 'text', type: 'MESSAGE' },
    { id: 'call-a', type: 'CALL_ACCEPTED', metadata: { callId: 'a' } },
    { id: 'call-b', type: 'CALL_END', metadata: { callId: 'b' } },
    { id: 'group', type: 'GROUP_CREATED' },
  ];
  const effects = [];
  const listeners = new Map();
  const wsClient = {
    on: (name, handler) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  };
  const hooks = {
    useState: (initial) => [
      typeof initial === 'function' ? initial() : initial,
      () => {},
    ],
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (callback) => effects.push(callback),
    useLayoutEffect: (callback) => effects.push(callback),
  };
  const pagination = {
    items,
    isLoading: false,
    hasMore: false,
    error: null,
    loadMore() {},
    setItems: (update) => {
      items = typeof update === 'function' ? update(items) : update;
    },
  };
  function dependency(name) {
    if (name === 'react') return hooks;
    if (name === 'react-native')
      return { FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator' };
    if (name === 'tamagui')
      return { Text: 'Text', XStack: 'XStack', YStack: 'YStack' };
    if (name.includes('websocket-client')) return { wsClient };
    if (name.includes('types/websocket'))
      return {
        WS_SERVER_EVENTS: {
          NEW_MESSAGE: 'NEW_MESSAGE',
          MESSAGE_SENT: 'MESSAGE_SENT',
        },
      };
    if (name.includes('use-cursor-pagination'))
      return { useCursorPagination: () => pagination };
    if (name.includes('use-infinite-scroll'))
      return { useInfiniteScrollSentinel: () => null };
    if (name.includes('chat-context'))
      return { useChatContext: () => ({ activeConversation: { id: 'chat' } }) };
    if (name.includes('user-context'))
      return { useUserContext: () => ({ user: { id: 'alice' } }) };
    if (name.startsWith('@') || name.startsWith('.')) return {};
    return require(name);
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    dependency,
    module,
    module.exports,
  );
  module.exports.MessageList();
  const subscriptions = effects.filter((callback) =>
    callback.toString().includes('unsubscribeNewMessage'),
  );
  assert.equal(subscriptions.length, 1);
  const cleanup = subscriptions[0]();
  const deleted = listeners.get('CALL_HISTORY_DELETED');
  assert.equal(typeof deleted, 'function');
  deleted({ callId: 'a' });
  assert.deepEqual(
    items.map((item) => item.id),
    ['text', 'call-b', 'group'],
  );
  deleted({});
  assert.deepEqual(
    items.map((item) => item.id),
    ['text', 'group'],
  );
  cleanup();
  assert.equal(listeners.has('CALL_HISTORY_DELETED'), false);
});
