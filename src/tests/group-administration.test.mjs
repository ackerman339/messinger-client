import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const mobile = fs.existsSync(
  new URL('../components/messages-list.tsx', import.meta.url),
);
const prefix = mobile ? '@/src/' : '@/';
const contextPrefix = mobile ? '@/src/contexts/' : '@/context/';
const components = mobile ? 'components/' : 'components/chat/';
function load(file, dependencies = {}) {
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
    (name) => {
      if (name in dependencies) return dependencies[name];
      if (name === 'react-native')
        return {
          Text: 'Text',
          View: 'View',
          ActivityIndicator: 'ActivityIndicator',
          FlatList: 'FlatList',
          AppState: {
            currentState: 'active',
            addEventListener: () => ({ remove() {} }),
          },
          BackHandler: { addEventListener: () => ({ remove() {} }) },
        };
      if (
        name === 'tamagui' ||
        name === 'lucide-react-native' ||
        name === 'lucide-react'
      )
        return new Proxy({}, { get: (_, key) => key });
      if (name === './group-dialog') return { GroupDialog: 'GroupDialog' };
      if (name.includes('emoji-picker'))
        return {
          __esModule: true,
          default: () => null,
          EmojiPicker: () => null,
        };
      if (name.startsWith('@') || name.startsWith('.')) return {};
      return require(name);
    },
    module,
    module.exports,
  );
  return module.exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object'
    ? text(node.props?.children)
    : String(node);
}
function hooks(initials = []) {
  const state = [],
    effects = [];
  return {
    state,
    effects,
    react: {
      useState(initial) {
        const i = state.length;
        state.push(i in initials ? initials[i] : initial);
        return [
          state[i],
          (next) => {
            state[i] = typeof next === 'function' ? next(state[i]) : next;
          },
        ];
      },
      useRef: (current) => ({ current }),
      useEffect: (effect) => effects.push(effect),
      useMemo: (factory) => factory(),
    },
  };
}
const group = () => ({
  id: 'g',
  name: 'Equipo',
  type: 'GROUP',
  messages: [],
  members: [
    { userId: 'alice', username: 'Alicia', role: 'OWNER' },
    { userId: 'bob', username: 'Roberto', role: 'MEMBER' },
    {
      userId: 'removed',
      username: 'Exmiembro',
      role: 'MEMBER',
      softDeletedAt: '2026-11-17',
    },
  ],
});
for (const [type, target, expected] of [
  ['MEMBER_JOINED', null, 'Roberto se unió al grupo'],
  ['MEMBER_LEFT', 'bob', 'Roberto dejó el grupo'],
  ['MEMBER_REMOVED', 'bob', 'Roberto fue eliminado del grupo'],
  ['OWNERSHIP_TRANSFERRED', 'bob', 'Roberto es el nuevo propietario'],
]) {
  test(`${type} resolves the affected member by ID in the client`, () => {
    const { ConversationEventMessage } = load(
      `${components}conversation-event-message.tsx`,
    );
    const tree = ConversationEventMessage({
      message: {
        type,
        actorId: type === 'MEMBER_JOINED' ? 'bob' : 'alice',
        targetUserId: target,
        createdAt: '2026-11-17T12:00:00Z',
      },
      members: group().members,
    });
    assert.ok(text(tree).includes(expected));
  });
}
function management(
  action,
  { role = 'OWNER', selected = 'bob', fail = false, request } = {},
) {
  const h = hooks([selected]);
  const calls = [],
    deleted = [],
    removed = [],
    owners = [],
    closed = [];
  const conversation = group();
  conversation.members[0].role = role;
  const service = Object.fromEntries(
    ['deleteGroup', 'leaveGroup', 'transferOwnership'].map((name) => [
      name,
      async (dto) => {
        calls.push([name, dto]);
        if (fail) throw new Error('failed');
        if (request) await request;
      },
    ]),
  );
  const tree = load(`${components}group-management-dialog.tsx`, {
    react: h.react,
    [contextPrefix + 'user-context']: {
      useUserContext: () => ({ user: { id: 'alice' } }),
    },
    [contextPrefix + 'chat-context']: {
      useChatContext: () => ({
        handleGroupDeleted: (id) => deleted.push(id),
        handleRemoveConversation: (id) => removed.push(id),
        handleGroupOwnerChanged: (...args) => owners.push(args),
      }),
    },
    [prefix + 'services/conversation']: { conversationService: service },
  }).GroupManagementDialog({
    group: conversation,
    action,
    onClose: () => closed.push(true),
  });
  const button = nodes(tree).find(
    (node) =>
      (node.props?.['aria-label'] ?? node.props?.accessibilityLabel) ===
      'Confirmar acción del grupo',
  );
  return {
    tree,
    submit: button.props.onClick ?? button.props.onPress,
    calls,
    deleted,
    removed,
    owners,
    closed,
    state: h.state,
  };
}
test('deleting waits for server success and then marks the group read-only', async () => {
  let finish;
  const f = management('delete', {
    request: new Promise((resolve) => {
      finish = resolve;
    }),
  });
  const pending = f.submit();
  assert.deepEqual(f.deleted, []);
  finish();
  await pending;
  assert.deepEqual(f.calls, [['deleteGroup', { conversationId: 'g' }]]);
  assert.deepEqual(f.deleted, ['g']);
});
test('failed deletion preserves the group and displays an error', async () => {
  const f = management('delete', { fail: true });
  await f.submit();
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.closed, []);
  assert.ok(f.state[2]);
});
test('transfer lists only eligible members and changes ownership after success', async () => {
  const f = management('transfer');
  if (mobile) {
    const list = nodes(f.tree).find((node) => node.type === 'FlatList');
    assert.deepEqual(
      list.props.data.map((member) => member.userId),
      ['bob'],
    );
  } else {
    assert.ok(text(f.tree).includes('Roberto'));
    assert.ok(!text(f.tree).includes('Exmiembro'));
    assert.ok(!text(f.tree).includes('Alicia'));
  }
  await f.submit();
  assert.deepEqual(f.calls, [
    ['transferOwnership', { conversationId: 'g', newOwnerId: 'bob' }],
  ]);
  assert.deepEqual(f.owners, [['g', 'bob']]);
});
test('invalid transfer targets and non-owners cannot invoke owner operations', async () => {
  for (const f of [
    management('transfer', { selected: 'removed' }),
    management('delete', { role: 'MEMBER' }),
    management('transfer', { role: 'MEMBER' }),
  ]) {
    await f.submit();
    assert.deepEqual(f.calls, []);
  }
});
test('ordinary members can leave; the owner must transfer ownership first', async () => {
  const member = management('leave', { role: 'MEMBER' });
  await member.submit();
  assert.deepEqual(member.calls, [
    ['leaveGroup', { conversationId: 'g' }],
  ]);
  assert.deepEqual(member.removed, ['g']);
  const owner = management('leave');
  await owner.submit();
  assert.deepEqual(owner.calls, []);
});
test('deleted composers show the notice without any message, attachment or recording controls', () => {
  const h = hooks();
  const tree = load(`${components}message-composer.tsx`, {
    react: h.react,
    [mobile ? contextPrefix + 'chat-context' : '@context/chat-context']: {
      useChatContext: () => ({
        activeConversation: { ...group(), isDeleted: true },
      }),
    },
    [prefix + 'hooks/use-voice-recorder']: {
      useVoiceRecorder: () => ({
        isRecording: false,
        cancelRecording: async () => {},
      }),
    },
    [prefix + 'lib/constants']: { COLORS: {} },
  }).MessageComposer();
  assert.ok(text(tree).includes('Este grupo fue eliminado'));
  assert.ok(
    !nodes(tree).some((node) =>
      ['textarea', 'input', 'button', 'TextInput'].includes(node.type),
    ),
  );
});
test('member names stay available after departure, and a stale refresh cannot revive a deleted group', () => {
  const { mergeGroup } = load('services/groups.ts');
  const original = group();
  const updated = mergeGroup(original, {
    ...original,
    members: original.members.filter((member) => member.userId !== 'bob'),
  });
  assert.equal(
    updated.knownMembers.find((member) => member.userId === 'bob')
      .username,
    'Roberto',
  );
  const deleted = { ...updated, isDeleted: true };
  assert.equal(mergeGroup(deleted, group()), deleted);
});
