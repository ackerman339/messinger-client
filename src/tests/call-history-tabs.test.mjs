import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const source = fs.readFileSync(
  new URL('../components/chat/conversation-list.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'conversation-list.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const headerSource = fs.readFileSync(
  new URL('../components/chat/chat-header.tsx', import.meta.url),
  'utf8',
);
const headerCode = ts.transpileModule(headerSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

const contactTypesSource = fs.readFileSync(new URL('../types/contact.ts', import.meta.url), 'utf8');
const contactTypesCode = ts.transpileModule(contactTypesSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const contactTypes = { exports: {} };
new Function('exports', contactTypesCode)(contactTypes.exports);

const listStateSource = fs.readFileSync(new URL('../services/conversation-list-state.ts', import.meta.url), 'utf8');
const listStateCode = ts.transpileModule(listStateSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText;
const listState = { exports: {} };
new Function('exports', listStateCode)(listState.exports);

function Calls() {
  return React.createElement('section', null, 'calls fixture');
}
function Contacts() {
  return React.createElement('section', null, 'contacts fixture');
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture({ conversations = [], contacts = new Map() } = {}) {
  let selected = 'chats';
  let paginationEnabled;
  const hooks = {
    useState: (initial) =>
      initial === 'chats'
        ? [
            selected,
            (value) => {
              selected = value;
            },
          ]
        : [initial, () => {}],
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useEffect() {},
    useLayoutEffect() {},
  };
  const context = {
    conversations: new Map(conversations.map((item) => [item.id, item])),
    activeConversation: null,
    loadingConversations: false,
    hasMoreConversations: true,
    handleCurrentConversation() {},
    loadMoreConversations() {},
    handleNewConversation() {},
  };
  function dependency(name) {
    if (name === 'react') return hooks;
    if (name.endsWith('/group-call-controls')) return { GroupCallButtons: () => null };
    if (name.endsWith('/call-buttons')) return { CallButtons: () => null };
    if (name === './header-button') return { HeaderButton: () => null };
    if (name.includes('/lib/utils')) return {};
    if (name.includes('contacts-list')) return { ContactsList: Contacts };
    if (name.includes('call-history-list')) return { CallHistoryList: Calls };
    if (name.includes('chat-menu'))
      return { ChatMenu: () => React.createElement('button', null, 'Menu') };
    if (name.includes('contacts-context')) return { useContactsContext: () => ({ contacts }) };
    if (name.endsWith('/types/contact')) return contactTypes.exports;
    if (name.endsWith('/services/conversation-list-state')) return listState.exports;
    if (name.includes('chat-context')) return { useChatContext: () => context };
    if (name.includes('user-context'))
      return { useUserContext: () => ({ user: { id: 'alice' } }) };
    if (name.includes('use-infinite-scroll'))
      return {
        useInfiniteScrollSentinel: (options) => {
          paginationEnabled = options.enabled;
          return null;
        },
      };
    if (name === 'react-native')
      return {
        FlatList: 'FlatList',
        Pressable: 'Pressable',
        ActivityIndicator: 'ActivityIndicator',
      };
    if (name === 'tamagui')
      return {
        Text: 'Text',
        XStack: 'XStack',
        YStack: 'YStack',
        Input: 'Input',
      };
    if (name === 'lucide-react-native')
      return { MessagesSquare: 'MessagesSquare', Phone: 'Phone' };
    if (name.includes('lib/constants'))
      return { COLORS: { accent: '#54a9eb', 'text-secondary': '#707579' } };
    if (name.startsWith('@')) return {};
    return require(name);
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    dependency,
    module,
    module.exports,
  );
  const header = { exports: {} };
  new Function('require', 'module', 'exports', headerCode)(dependency, header, header.exports);
  return {
    render: () => module.exports.ConversationList(),
    renderHeader(conversation) {
      context.activeConversation = conversation;
      return header.exports.ChatHeader();
    },
    paginationEnabled: () => paginationEnabled,
  };
}
test('web uses Radix Tabs in the conversation sidebar and renders the selected calls panel', () => {
  const view = fixture();
  let tree = view.render();
  assert.equal(tree.type, require('radix-ui').Tabs.Root);
  const chats = nodes(tree).find(
    (node) =>
      node.type === require('radix-ui').Tabs.Content &&
      node.props.value === 'chats',
  );
  assert.equal(chats.props.forceMount, true);
  assert.ok(chats.props.className.includes('data-[state=inactive]:hidden'));
  let html = require('react-dom/server').renderToStaticMarkup(tree);
  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('Chats, llamadas y contactos'));
  assert.ok(!html.includes('calls fixture'));
  tree.props.onValueChange('calls');
  tree = view.render();
  assert.equal(tree.props.value, 'calls');
  html = require('react-dom/server').renderToStaticMarkup(tree);
  assert.ok(html.includes('calls fixture'));
  assert.equal(view.paginationEnabled(), false);
  tree.props.onValueChange('contacts');
  html = require('react-dom/server').renderToStaticMarkup(view.render());
  assert.ok(html.includes('contacts fixture'));
  assert.ok(!html.includes('calls fixture'));
  assert.equal(view.paginationEnabled(), false);
});

test('conversation rows use the saved contact name only for private chats', () => {
  const privateChat = {
    id: 'private',
    type: 'PRIVATE',
    updatedAt: '2026-11-20T12:00:00Z',
    members: [
      { userId: 'alice' },
      { userId: 'bob', username: 'Roberto' },
    ],
  };
  const group = { ...privateChat, id: 'group', type: 'GROUP', name: 'Equipo' };
  const contacts = new Map([['bob', { name: 'Beto', username: 'Roberto' }]]);
  const view = fixture({ contacts, conversations: [privateChat, group] });

  function rowText(conversation) {
    const tree = view.render();
    const row = nodes(tree).find((node) => node.props?.conversation === conversation);
    return nodes(row.type(row.props)).map((node) => node.props?.children);
  }

  assert.ok(rowText(privateChat).includes('Beto'));
  assert.ok(rowText(group).includes('Equipo'));
  assert.ok(!rowText(group).includes('Beto'));
  contacts.delete('bob');
  assert.ok(rowText(privateChat).includes('Roberto'));
});


test('chat rows and headers show the participant image and fall back after removal', () => {
  const avatarUrl = 'https://r2.example.test/avatars/peer.png';
  const participant = { userId: 'bob', username: 'Roberto', avatarUrl };
  const privateChat = {
    id: 'private',
    type: 'PRIVATE',
    updatedAt: '2026-11-20T12:00:00Z',
    members: [{ userId: 'alice' }, participant],
  };
  const group = { ...privateChat, id: 'group', type: 'GROUP', name: 'Equipo' };
  const contacts = new Map();
  const view = fixture({ contacts, conversations: [privateChat, group] });

  function renderedRow(conversation) {
    const tree = view.render();
    const row = nodes(tree).find((node) => node.props?.conversation === conversation);
    return row.type(row.props);
  }

  function avatarSrc(tree) {
    const Image = require('radix-ui').Avatar.Image;
    return nodes(tree).find((node) => node.type === Image)?.props.src;
  }

  assert.equal(avatarSrc(renderedRow(privateChat)), avatarUrl);
  assert.equal(avatarSrc(view.renderHeader(privateChat)), avatarUrl);
  assert.equal(avatarSrc(renderedRow(group)), undefined);
  assert.equal(avatarSrc(view.renderHeader(group)), undefined);

  contacts.set('bob', { avatarUrl });
  participant.avatarUrl = null;
  assert.equal(avatarSrc(renderedRow(privateChat)), undefined);
  assert.equal(avatarSrc(view.renderHeader(privateChat)), undefined);
});
