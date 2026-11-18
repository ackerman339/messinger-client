import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
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
      return require(name);
    },
    module,
    module.exports,
  );
  return module.exports;
}
function service(
  bootstrap = async () => ({ page: [], nextCursor: null }),
) {
  return load('services/groups.ts', {
    './conversation': { conversationService: { getBootstrap: bootstrap } },
    '@/clients/websocket-client': { wsClient: {} },
  });
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function hooks(initials = []) {
  let index = 0;
  const state = [];
  return {
    state,
    react: {
      useState(value) {
        const i = index++;
        state[i] = i in initials ? initials[i] : value;
        return [
          state[i],
          (next) => {
            state[i] = typeof next === 'function' ? next(state[i]) : next;
          },
        ];
      },
      useRef: (current) => ({ current }),
      useEffect() {},
    },
  };
}
test('contact picker loads every page, deduplicates contacts and excludes self and group members', async () => {
  const calls = [];
  const groups = service(async ({ cursor }) => {
    calls.push(cursor);
    return {
      page: [
        {
          type: 'PRIVATE',
          members: [
            { userId: 'me', username: 'Yo' },
            { userId: 'a', username: 'Ana' },
            { userId: cursor ? 'b' : 'existing', username: 'Bob' },
          ],
        },
      ],
      nextCursor: cursor ? null : 'page-2',
    };
  });
  const all = await groups.getAllConversations();
  const contacts = groups.inviteCandidates(
    all,
    { members: [{ userId: 'existing' }] },
    'me',
  );
  assert.deepEqual(calls, [null, 'page-2']);
  assert.deepEqual(
    contacts.map((item) => item.userId),
    ['a', 'b'],
  );
});
test('pending invitations retain group names and do not fabricate membership', () => {
  const group = service().invitationConversation({
    conversationId: 'g',
    groupName: 'Equipo',
    invitedBy: 'owner',
    invitationId: 'i',
  });
  assert.equal(group.name, 'Equipo');
  assert.equal(group.type, 'GROUP');
  assert.deepEqual(group.members, []);
  assert.equal(group.invitation.invitationId, 'i');
});
test('create group opens the new conversation with its name and owner', async () => {
  const h = hooks([' Equipo ', false, '']);
  const stored = [],
    selected = [],
    closed = [];
  const tree = load('components/chat/create-group-dialog.tsx', {
    react: h.react,
    '@/context/user-context': {
      useUserContext: () => ({ user: { id: 'me', username: 'Yo' } }),
    },
    '@/context/chat-context': {
      useChatContext: () => ({
        handleNewConversation: (c) => stored.push(c),
        handleCurrentConversation: (id) => selected.push(id),
        handleReceiverId() {},
      }),
    },
    '@/services/conversation': {
      conversationService: {
        createGroup: async (dto) => {
          assert.deepEqual(dto, { name: 'Equipo', members: [] });
          return { id: 'new', name: 'Equipo' };
        },
      },
    },
    '@/services/groups': service(),
  }).CreateGroupDialog({
    open: true,
    onOpenChange: (open) => closed.push(open),
  });
  await nodes(tree)
    .find((node) => node.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  assert.equal(stored[0].name, 'Equipo');
  assert.equal(stored[0].members[0].role, 'OWNER');
  assert.deepEqual(selected, ['new']);
  assert.deepEqual(closed, [false]);
});
function panel(action) {
  const h = hooks();
  const stored = [],
    removed = [];
  const tree = load('components/chat/group-invitation-panel.tsx', {
    react: h.react,
    '@/context/chat-context': {
      useChatContext: () => ({
        activeConversation: { id: 'g', name: 'Equipo', invitation: {} },
        handleNewConversation: (c) => stored.push(c),
        handleRemoveConversation: (id) => removed.push(id),
      }),
    },
    '@/services/groups': {
      groupService: { accept: action, reject: action },
      groupError: (error) => error.message,
      getAllConversations: async () => [{ id: 'g', name: 'Equipo' }],
    },
  }).GroupInvitationPanel();
  const button = (label) =>
    nodes(tree).find(
      (node) => node.type === 'button' && node.props.children === label,
    );
  return { button, stored, removed, state: h.state };
}
test('acceptance waits for confirmation and then loads the group', async () => {
  let finish;
  const f = panel(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.button('Aceptar').props.onClick();
  assert.equal(f.stored.length, 0);
  finish();
  await pending;
  assert.equal(f.stored[0].id, 'g');
});
test('failed rejection preserves the invitation and exposes an error', async () => {
  const f = panel(async () => {
    throw new Error('Sin conexión');
  });
  await f.button('Rechazar').props.onClick();
  assert.deepEqual(f.removed, []);
  assert.equal(f.state[2], 'Sin conexión');
});
test('confirmed rejection removes the pending conversation', async () => {
  const f = panel(async () => {});
  await f.button('Rechazar').props.onClick();
  assert.deepEqual(f.removed, ['g']);
});
for (const desktop of [true, false]) {
  test(`pending invitations never mount history or composer (${desktop ? 'desktop' : 'mobile'})`, () => {
    const MessageList = () => null,
      MessageComposer = () => null,
      GroupInvitationPanel = () => null;
    const tree = load('components/chat/chat-layout.tsx', {
      'react-responsive': { useMediaQuery: () => desktop },
      '@context/chat-context': {
        useChatContext: () => ({
          activeConversation: { id: 'g', invitation: {} },
        }),
      },
      './chat-header': { ChatHeader: () => null },
      './conversation-list': { ConversationList: () => null },
      './message-list': { MessageList },
      './message-composer': { MessageComposer },
      './group-invitation-panel': { GroupInvitationPanel },
    }).ChatLayout();
    assert.ok(
      nodes(tree).some((node) => node.type === GroupInvitationPanel),
    );
    assert.ok(
      !nodes(tree).some(
        (node) =>
          node.type === MessageList || node.type === MessageComposer,
      ),
    );
  });
}
test('multi-select sends each selected invitation and preserves failed selections for retry', async () => {
  const h = hooks([[], ['a', 'b'], [], false, false, '', '', 0]);
  const calls = [];
  const tree = load('components/chat/invite-group-dialog.tsx', {
    react: h.react,
    '@/context/user-context': {
      useUserContext: () => ({ user: { id: 'me' } }),
    },
    '@/services/groups': {
      groupService: {
        invite: async (_group, id) => {
          calls.push(id);
          if (id === 'b') throw new Error('Falló Bob');
        },
      },
      groupError: (error) => error.message,
    },
  }).InviteGroupDialog({
    group: { id: 'g', name: 'Equipo' },
    onClose() {},
  });
  const button = nodes(tree)
    .filter((node) => node.type === 'button')
    .at(-1);
  await button.props.onClick();
  assert.deepEqual(calls, ['a', 'b']);
  assert.deepEqual(h.state[1], ['b']);
  assert.deepEqual(h.state[2], ['a']);
  assert.equal(h.state[5], 'Falló Bob');
});
function transport() {
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    sent = [];
    constructor() {
      Socket.instance = this;
    }
    send(raw) {
      this.sent.push(JSON.parse(raw));
    }
    close() {}
    receive(type, data, requestId) {
      this.onmessage({ data: JSON.stringify({ type, data, requestId }) });
    }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  const wsClient = load('clients/websocket-client.ts', {
    '@services/auth': { authService: {} },
    '@/types/websocket': {
      WS_SERVER_EVENTS: {
        GROUP_INVITATION: 'GROUP_INVITATION',
        GROUP_ACTION_CONFIRMED: 'GROUP_ACTION_CONFIRMED',
        ERROR: 'ERROR',
      },
    },
  }).wsClient;
  wsClient.connect('ws://test');
  return {
    wsClient,
    socket: Socket.instance,
    cleanup: () => {
      globalThis.WebSocket = original;
    },
  };
}
test('group commands resolve only with their matching server confirmation', async () => {
  const f = transport();
  try {
    let resolved = false;
    const command = f.wsClient
      .request('GROUP_INVITE_MEMBER', {
        conversationId: 'g',
        targetUserId: 'a',
      })
      .then(() => {
        resolved = true;
      });
    const request = f.socket.sent[0];
    assert.ok(request.requestId);
    f.socket.receive('GROUP_ACTION_CONFIRMED', {}, 'other-request');
    await Promise.resolve();
    assert.equal(resolved, false);
    f.socket.receive('GROUP_ACTION_CONFIRMED', {}, request.requestId);
    await command;
    assert.equal(resolved, true);
  } finally {
    f.cleanup();
  }
});
test('correlated server errors reject the correct group command', async () => {
  const f = transport();
  try {
    const command = f.wsClient.request('GROUP_INVITATION_ACCEPT', {
      conversationId: 'g',
    });
    f.socket.receive(
      'ERROR',
      { error: { code: 'GROUP_INVITATION:EXPIRED' } },
      f.socket.sent[0].requestId,
    );
    await assert.rejects(command, /EXPIRED/);
  } finally {
    f.cleanup();
  }
});
test('invitations arriving before the chat mounts are replayed once', async () => {
  const f = transport();
  try {
    const invitation = {
      conversationId: 'g',
      groupName: 'Equipo',
      invitedBy: 'a',
    };
    f.socket.receive('GROUP_INVITATION', invitation);
    const received = [];
    const off = f.wsClient.on('GROUP_INVITATION', (data) =>
      received.push(data),
    );
    await Promise.resolve();
    assert.deepEqual(received, [invitation]);
    off();
    f.wsClient.on('GROUP_INVITATION', () =>
      assert.fail('invitation replayed twice'),
    );
    await Promise.resolve();
  } finally {
    f.cleanup();
  }
});
test('a disconnected socket rejects instead of silently dropping group actions', async () => {
  const f = transport();
  try {
    f.socket.readyState = 3;
    await assert.rejects(
      f.wsClient.request('GROUP_INVITATION_REJECT', {
        conversationId: 'g',
      }),
      /conexión/,
    );
  } finally {
    f.cleanup();
  }
});
test('the provider adds incoming invitations as pending conversations and removes rejected ones', () => {
  const effects = [],
    events = new Map();
  const h = hooks();
  const react = {
    ...h.react,
    useEffect: (effect) => effects.push(effect),
    useMemo: (callback) => callback(),
  };
  const { ChatProvider } = load('providers/chat-provider.tsx', {
    react,
    'react-router-dom': {
      useSearchParams: () => [new URLSearchParams(), () => {}],
    },
    '@context/user-context': {
      useUserContext: () => ({ user: { id: 'me' } }),
    },
    '@context/chat-context': { ChatContext: { Provider: () => null } },
    '@services/conversation': { conversationService: {} },
    '@services/files': { fileService: {} },
    '@services/user': { userService: {} },
    '@/services/groups': service(),
    '@/hooks/use-cursor-pagination': {
      useCursorPagination: () => ({ items: [] }),
    },
    '@clients/websocket-client': {
      wsClient: {
        on: (event, handler) => {
          events.set(event, handler);
          return () => events.delete(event);
        },
      },
    },
    '@/types/websocket': {
      WS_CLIENT_EVENTS: {},
      WS_SERVER_EVENTS: Object.fromEntries(
        [
          'GROUP_INVITATION',
          'GROUP_INVITATION_REJECTED',
          'GROUP_MEMBER_JOINED',
          'GROUP_MEMBER_LEFT',
          'GROUP_MEMBER_REMOVED',
          'GROUP_OWNER_CHANGED',
          'GROUP_DELETED',
          'NEW_MESSAGE',
        ].map((event) => [event, event]),
      ),
    },
  });
  const provider = ChatProvider({ children: null });
  effects.forEach((effect) => effect());
  events.get('GROUP_INVITATION')({
    conversationId: 'g',
    groupName: 'Equipo',
    invitedBy: 'owner',
  });
  assert.equal(h.state[0].get('g').name, 'Equipo');
  assert.ok(h.state[0].get('g').invitation);
  events.get('GROUP_INVITATION_REJECTED')({ conversationId: 'g' });
  assert.equal(h.state[0].has('g'), false);
  h.state[0].set('active', {
    id: 'active',
    type: 'GROUP',
    members: [],
    messages: [],
  });
  provider.props.value.handleCurrentConversation('active');
  events.get('GROUP_DELETED')({ conversationId: 'active' });
  assert.equal(h.state[0].get('active').isDeleted, true);
  assert.equal(h.state[1], 'active');
});
