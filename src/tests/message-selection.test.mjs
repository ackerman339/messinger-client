import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const mobile = fs.existsSync(
  new URL('../components/messages-list.tsx', import.meta.url),
);
const source = fs.readFileSync(
  new URL(
    mobile
      ? '../components/messages-list.tsx'
      : '../components/chat/message-list.tsx',
    import.meta.url,
  ),
  'utf8',
);
const code = ts.transpileModule(source + '\nexport { MessageBubble };', {
  fileName: 'message-list.tsx',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2023,
  },
}).outputText;
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture(ids, messages, activeConversation = { id: 'chat' }) {
  const copied = [],
    deleted = [],
    updates = [];
  let stateIndex = 0;
  const react = {
    useState: (value) => [
      stateIndex++ === 0 ? ids : value,
      (next) => updates.push(next),
    ],
    useRef: (current) => ({ current }),
    useEffect() {},
    useLayoutEffect() {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  const generic = new Proxy({}, { get: (_, key) => key });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name === 'react') return react;
      if (name === '@react-navigation/native') return { useIsFocused: () => true };
      if (name.includes('services/message-sync')) return {
        messageSync: { getSnapshot: () => ({ pending: [], updates: new Map(), connected: true, connectionEpoch: 1 }) },
        getDeliveryStatus: () => 'SENT',
        pendingForConversation: () => [],
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'expo-clipboard')
        return {
          setStringAsync: async (text) => {
            copied.push(text);
            return true;
          },
        };
      if (name.includes('user-context'))
        return { useUserContext: () => ({ user: { id: 'me', username: 'Lucía' } }) };
      if (name.includes('chat-context'))
        return {
          useChatContext: () => ({ activeConversation }),
        };
      if (name.includes('use-cursor-pagination'))
        return {
          useCursorPagination: () => ({
            items: messages,
            setItems() {},
            isLoading: false,
          }),
        };
      if (name.includes('use-infinite-scroll'))
        return { useInfiniteScrollSentinel: () => ({ current: null }) };
      if (name.includes('services/conversation'))
        return {
          conversationService: {
            deleteMessages: async (data) => deleted.push(data),
          },
        };
      if (name === 'date-fns') return { format: () => '' };
      return generic;
    },
    module,
    module.exports,
  );
  const tree = module.exports.MessageList();
  const bar = nodes(tree).find(
    (node) => node.type === 'MessageSelectionBar',
  )?.props;
  return {
    bar,
    copied,
    deleted,
    updates,
    select: (id) => {
      const bubble = mobile
        ? nodes(tree)
            .find((node) => node.type === 'FlatList')
            .props.renderItem({ item: messages[0] })
        : nodes(tree).find(
            (node) => node.type === module.exports.MessageBubble,
          );
      bubble.props.onSelect(id);
      return updates.at(-1)(ids);
    },
    bubble: module.exports.MessageBubble,
  };
}
const own = {
  id: 'one',
  messageId: 'one',
  senderId: 'me',
  content: 'Hola\ntexto exacto',
  createdAt: new Date().toISOString(),
  attachments: [],
};
const received = {
  ...own,
  id: 'two',
  messageId: 'two',
  senderId: 'other',
  content: 'Recibido',
};

test('one received text can be copied exactly but cannot be deleted', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const f = fixture(['two'], [own, received]);
  if (!mobile)
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: async (text) => f.copied.push(text) } },
    });
  try {
    assert.equal(f.bar.canCopy, true);
    assert.equal(f.bar.canDelete, false);
    await f.bar.onCopy();
    await f.bar.onDelete();
    assert.deepEqual(f.copied, ['Recibido']);
    assert.deepEqual(f.deleted, []);
  } finally {
    if (!mobile) {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else delete globalThis.navigator;
    }
  }
});
test('empty content cannot be copied while own attachments can be deleted', () => {
  const f = fixture(['one'], [{ ...own, content: '' }]);
  assert.equal(f.bar.canCopy, false);
  assert.equal(f.bar.canDelete, true);
});
test('multiple texts never expose copying and mixed ownership prevents deleting', async () => {
  const f = fixture(['one', 'two'], [own, received]);
  assert.equal(f.bar.canCopy, false);
  assert.equal(f.bar.canDelete, false);
  await f.bar.onCopy();
  await f.bar.onDelete();
  assert.deepEqual(f.copied, []);
  assert.deepEqual(f.deleted, []);
});
test('multiple own messages remain deletable', async () => {
  const f = fixture(['one', 'two'], [own, { ...received, senderId: 'me' }]);
  assert.equal(f.bar.canCopy, false);
  assert.equal(f.bar.canDelete, true);
  await f.bar.onDelete();
  assert.deepEqual(f.deleted, [
    { conversationId: 'chat', messagesIds: ['one', 'two'] },
  ]);
});
test('received message press enables selection', () => {
  const f = fixture([], [received]);
  const selected = [];
  const tree = f.bubble({
    message: received,
    selected: false,
    onSelect: (id) => selected.push(id),
  });
  const target = nodes(tree).find((node) =>
    mobile ? node.type === 'Pressable' : node.type === 'article',
  );
  assert.notEqual(target.props.disabled, true);
  if (mobile) target.props.onPress();
  else target.props.onClick({ stopPropagation() {} });
  assert.deepEqual(selected, ['two']);
});

const anotherOwn = { ...own, id: 'three', messageId: 'three' };
const anotherReceived = { ...received, id: 'four', messageId: 'four' };
const selectionMessages = [own, received, anotherOwn, anotherReceived];
test('a received message locks out any additional selection until deselected', () => {
  const f = fixture(['two'], selectionMessages);
  assert.deepEqual(f.select('one'), ['two']);
  assert.deepEqual(f.select('four'), ['two']);
  assert.deepEqual(f.select('two'), []);
});
test('own messages allow multiple selection but never include received messages', () => {
  const single = fixture(['one'], selectionMessages);
  assert.deepEqual(single.select('three'), ['one', 'three']);
  assert.deepEqual(single.select('two'), ['one']);
  const multiple = fixture(['one', 'three'], selectionMessages);
  assert.deepEqual(multiple.select('two'), ['one', 'three']);
  assert.deepEqual(multiple.select('one'), ['three']);
});
test('an empty selection accepts either an own or received message', () => {
  const f = fixture([], selectionMessages);
  assert.deepEqual(f.select('one'), ['one']);
  assert.deepEqual(f.select('two'), ['two']);
});

test('messages with attachments cannot be copied even when they contain a caption', async () => {
  const attachmentMessage = { ...own, attachments: [{ id: 'attachment' }] };
  const f = fixture(['one'], [attachmentMessage]);
  assert.equal(f.bar.canCopy, false);
  assert.equal(f.bar.canDelete, true);
  await f.bar.onCopy();
  assert.deepEqual(f.copied, []);
});
test('received attachments and empty text never open selection', () => {
  const f = fixture(
    [],
    [
      { ...received, attachments: [{ id: 'attachment' }] },
      { ...anotherReceived, content: '' },
    ],
  );
  assert.deepEqual(f.select('two'), []);
  assert.deepEqual(f.select('four'), []);
});

test('group bubbles display the current sender name and use known members for older messages', () => {
  const group = {
    id: 'chat',
    type: 'GROUP',
    members: [{ userId: 'other', username: 'Camila' }],
    knownMembers: [
      { userId: 'other', username: 'Nombre anterior' },
      { userId: 'former', username: 'Andrés' },
    ],
  };
  const { bubble } = fixture([], [], group);
  for (const [message, name] of [
    [{ ...received, conversationId: group.id }, 'Camila'],
    [{ ...received, senderId: 'former', attachments: [{ id: 'file' }] }, 'Andrés'],
    [own, 'Lucía'],
  ]) {
    const tree = bubble({ message, selected: false, onSelect() {} });
    assert.ok(nodes(tree).some((node) => node.props?.children === name));
  }
});

test('private bubbles use the message content without adding a sender label', () => {
  const { bubble } = fixture([], [], {
    id: 'chat',
    type: 'PRIVATE',
    members: [{ userId: 'other', username: 'Camila' }],
  });
  const tree = bubble({ message: received, selected: false, onSelect() {} });
  assert.ok(nodes(tree).some((node) => node.props?.children === received.content));
  assert.ok(!nodes(tree).some((node) => node.props?.children === 'Camila'));
});
