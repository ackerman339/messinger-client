import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const mobile = fs.existsSync(
  new URL('../components/messages-list.tsx', import.meta.url),
);
function load(file, dependency) {
  const source = fs.readFileSync(
    new URL(`../${file}`, import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    dependency,
    module,
    module.exports,
  );
  return module.exports;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function pagination() {
  const slots = [],
    cleanups = [],
    effects = [],
    requests = [];
  let index = 0;
  const react = {
    useState(initial) {
      const id = index++;
      if (!(id in slots)) slots[id] = initial;
      return [
        slots[id],
        (update) => {
          slots[id] =
            typeof update === 'function' ? update(slots[id]) : update;
        },
      ];
    },
    useRef(initial) {
      const id = index++;
      return (slots[id] ??= { current: initial });
    },
    useCallback(callback) {
      index++;
      return callback;
    },
    useEffect(callback, deps) {
      const id = index++,
        previous = slots[id];
      if (
        !previous ||
        deps.some((item, i) => !Object.is(item, previous[i]))
      ) {
        slots[id] = deps;
        effects.push(() => {
          cleanups[id]?.();
          cleanups[id] = callback();
        });
      }
    },
  };
  const { useCursorPagination } = load(
    'hooks/use-cursor-pagination.ts',
    () => react,
  );
  return {
    slots,
    requests,
    render(conversation) {
      index = 0;
      const result = useCursorPagination({
        fetchPage: (cursor) =>
          new Promise((resolve, reject) =>
            requests.push({ conversation, cursor, resolve, reject }),
          ),
        reverse: true,
        deps: [conversation],
        getItemKey: (item) => item.id,
      });
      effects.splice(0).forEach((effect) => effect());
      return result;
    },
    unmount() {
      cleanups.forEach((cleanup) => cleanup?.());
    },
  };
}
test('late group history cannot mix with the private chat after switching', async () => {
  const f = pagination();
  f.render('group');
  f.render('private');
  f.requests[1].resolve({
    page: [{ id: 'private-message' }],
    nextCursor: null,
  });
  await flush();
  f.requests[0].resolve({
    page: [{ id: 'group-message' }],
    nextCursor: 'group-cursor',
  });
  await flush();
  assert.deepEqual(f.slots[0], [{ id: 'private-message' }]);
  assert.equal(f.slots[1], null);
  assert.equal(f.slots[2], false);
  f.unmount();
});
test('switching group → private → group ignores both obsolete requests', async () => {
  const f = pagination();
  f.render('group');
  f.render('private');
  f.render('group');
  f.requests[2].resolve({
    page: [{ id: 'current-group' }],
    nextCursor: null,
  });
  await flush();
  f.requests[1].resolve({
    page: [{ id: 'private-message' }],
    nextCursor: 'private-cursor',
  });
  f.requests[0].reject(new Error('old group failed'));
  await flush();
  assert.deepEqual(f.slots[0], [{ id: 'current-group' }]);
  assert.equal(f.slots[4], null);
  f.unmount();
});
test('an older page still loading is discarded when the conversation changes', async () => {
  const f = pagination();
  f.render('group');
  f.requests[0].resolve({
    page: [{ id: 'group-new' }],
    nextCursor: 'older',
  });
  await flush();
  f.render('group').loadMore();
  assert.equal(f.requests[1].cursor, 'older');
  f.render('private');
  f.requests[2].resolve({ page: [{ id: 'private' }], nextCursor: null });
  await flush();
  f.requests[1].resolve({
    page: [{ id: 'group-old' }],
    nextCursor: 'more',
  });
  await flush();
  assert.deepEqual(f.slots[0], [{ id: 'private' }]);
  f.unmount();
});
test('unmount invalidates the request before its history response arrives', async () => {
  const f = pagination();
  f.render('group');
  f.unmount();
  f.requests[0].resolve({ page: [{ id: 'late' }], nextCursor: null });
  await flush();
  assert.deepEqual(f.slots[0], []);
});
test('history and WebSocket delivery of the same message render only once', async () => {
  const f = pagination();
  const history = f.render('group');
  history.setItems([{ id: 'message', content: 'live' }]);
  f.requests[0].resolve({
    page: [{ id: 'message', content: 'page' }],
    nextCursor: null,
  });
  await flush();
  assert.deepEqual(f.slots[0], [{ id: 'message', content: 'live' }]);
  f.unmount();
});
function messages(conversationId) {
  const effects = [],
    events = new Map();
  let items = [];
  const hooks = {
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, () => {}],
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
    useLayoutEffect: (fn) => effects.push(fn),
  };
  const file = mobile
    ? 'components/messages-list.tsx'
    : 'components/chat/message-list.tsx';
  const module = load(file, (name) => {
    if (name === 'react') return hooks;
    if (name === 'expo-clipboard') return {};
    if (name === 'react-native' || name === 'tamagui')
      return new Proxy({}, { get: (_, key) => key });
    if (name.includes('websocket-client'))
      return {
        wsClient: {
          on: (event, fn) => {
            events.set(event, fn);
            return () => events.delete(event);
          },
        },
      };
    if (name.includes('types/websocket'))
      return {
        WS_SERVER_EVENTS: {
          NEW_MESSAGE: 'NEW_MESSAGE',
          MESSAGE_SENT: 'MESSAGE_SENT',
        },
      };
    if (name.includes('chat-context'))
      return {
        useChatContext: () => ({
          activeConversation: { id: conversationId },
        }),
      };
    if (name.includes('user-context'))
      return { useUserContext: () => ({ user: { id: 'me' } }) };
    if (name.includes('use-cursor-pagination'))
      return {
        useCursorPagination: () => ({
          items,
          hasMore: false,
          setItems: (fn) => {
            items = typeof fn === 'function' ? fn(items) : fn;
          },
        }),
      };
    if (name.includes('use-infinite-scroll'))
      return { useInfiniteScrollSentinel: () => null };
    if (name.startsWith('@') || name.startsWith('.')) return {};
    return require(name);
  });
  module.MessageList();
  const cleanup = effects.find((effect) =>
    effect.toString().includes('unsubscribeNewMessage'),
  )();
  return { events, cleanup, items: () => items };
}
test('group events cannot enter the private list and duplicate deliveries are ignored', () => {
  const f = messages('private');
  f.events.get('NEW_MESSAGE')({
    messageId: 'group-message',
    conversationId: 'group',
  });
  assert.deepEqual(f.items(), []);
  const message = {
    messageId: 'private-message',
    conversation: { id: 'private' },
  };
  f.events.get('NEW_MESSAGE')(message);
  f.events.get('MESSAGE_SENT')(message);
  assert.deepEqual(f.items(), [message]);
  const queuedCallback = f.events.get('NEW_MESSAGE');
  f.cleanup();
  queuedCallback({ messageId: 'late', conversationId: 'private' });
  assert.deepEqual(f.items(), [message]);
});
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
for (const desktop of mobile ? [false] : [false, true]) {
  test(`the ${mobile ? 'native' : desktop ? 'desktop' : 'small-screen web'} view mounts one conversation pane and resets its complete UI when switching`, () => {
    let conversation = { id: 'group' };
    const ConversationList = () => null,
      MessageList = () => null,
      MessageComposer = () => null,
      ChatHeader = () => null;
    const component = (name) => ({ [name]: () => null });
    const dependencies = mobile
      ? {
          'react-native': {
            KeyboardAvoidingView: 'KeyboardAvoidingView',
            Platform: { OS: 'android' },
          },
          'react-native-reanimated': {
            __esModule: true,
            default: { View: 'AnimatedView' },
            useAnimatedStyle: (fn) => fn(),
            withTiming: (value) => value,
          },
          'react-native-safe-area-context': {
            SafeAreaView: 'SafeAreaView',
          },
          tamagui: {
            YStack: 'YStack',
            PortalProvider: 'PortalProvider',
            PortalHost: 'PortalHost',
          },
          '@/src/contexts/chat-context': {
            useChatContext: () => ({ activeConversation: conversation }),
          },
          '@/src/components/chat-header': { ChatHeader },
          '@/src/components/conversations-list': { ConversationList },
          '@/src/components/messages-list': { MessageList },
          '@/src/components/message-composer': { MessageComposer },
          '@/src/components/group-invitation-panel': component(
            'GroupInvitationPanel',
          ),
          '@/src/providers/chat-provider': component('ChatProvider'),
          '@/src/providers/call-provider': component('CallProvider'),
          '@/src/providers/attachment-provider': component(
            'AttachmentProvider',
          ),
          '@/src/providers/user-provider': component('UserProvider'),
          '@/src/calls/componentes/call-panel': component('CallPanel'),
        }
      : {
          'react-responsive': { useMediaQuery: () => desktop },
          '@context/chat-context': {
            useChatContext: () => ({ activeConversation: conversation }),
          },
          './chat-header': { ChatHeader },
          './conversation-list': { ConversationList },
          './message-list': { MessageList },
          './message-composer': { MessageComposer },
          './group-invitation-panel': component('GroupInvitationPanel'),
        };
    const module = load(
      mobile ? '../app/chat.tsx' : 'components/chat/chat-layout.tsx',
      (name) => dependencies[name] ?? require(name),
    );
    const render = mobile
      ? () =>
          nodes(module.default())
            .find((node) => node.type?.name === 'ChatContent')
            .type()
      : module.ChatLayout;
    const first = render();
    for (const component of [
      ConversationList,
      MessageList,
      MessageComposer,
      ChatHeader,
    ]) {
      assert.equal(
        nodes(first).filter((node) => node.type === component).length,
        1,
      );
    }
    const pane = (tree) =>
      nodes(tree).find(
        (node) => node.type === (mobile ? 'AnimatedView' : 'section'),
      );
    assert.equal(pane(first).key, 'group');
    conversation = { id: 'private' };
    assert.equal(pane(render()).key, 'private');
  });
}
