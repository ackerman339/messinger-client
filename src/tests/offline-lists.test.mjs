import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(name, dependencies = {}) {
  const source = readFileSync(new URL(`../services/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => dependencies[id],
    module,
    module.exports
  );
  return module.exports;
}

function fixture() {
  const disk = new Map();
  const offlineStorage = {
    read: (key) => JSON.parse(disk.get(key) ?? 'null'),
    write: (key, value) => disk.set(key, JSON.stringify(value)),
    remove: (key) => disk.delete(key),
  };
  return {
    ...load('cached-list', { './offline-storage': { offlineStorage } }),
    ...load('offline-session', {
      './offline-storage': { offlineStorage },
      './attachment-storage': { clearAttachmentAccount() {} },
    }),
    disk,
  };
}

const page = (ids, nextCursor = null) => ({ page: ids.map((id) => ({ id })), nextCursor });
const keyOf = (item) => item.id;
const ids = (list) => [...list.getSnapshot().records.keys()];

for (const category of ['conversations', 'calls', 'contacts']) {
  test(`${category} survives an offline reload and stays isolated by account`, async () => {
    const { createCachedList, offlineListKey } = fixture();
    const cacheKey = offlineListKey(category, 'alice');
    const loaded = createCachedList({ cacheKey, keyOf, fetchPage: async () => page(['saved']) });
    await loaded.refresh();
    const fetchPage = async () => {
      throw Error('offline');
    };
    const restarted = createCachedList({ cacheKey, keyOf, fetchPage });
    assert.deepEqual(ids(restarted), ['saved']);
    await restarted.refresh();
    assert.deepEqual(ids(restarted), ['saved']);
    assert.equal(restarted.getSnapshot().loading, false);
    assert.equal(restarted.getSnapshot().ready, true);
    assert.deepEqual(
      ids(createCachedList({ cacheKey: offlineListKey(category, 'bob'), keyOf, fetchPage })),
      []
    );
  });
}

test('reconnect refreshes every loaded page using fresh cursors and preserves the next cursor on failure', async () => {
  const { createCachedList } = fixture();
  const cacheKey = 'conversations:alice';
  const first = createCachedList({
    cacheKey,
    keyOf,
    fetchPage: async (cursor) => (cursor ? page(['b'], 'older') : page(['a'], 'initial')),
  });
  await first.refresh();
  await first.loadMore();
  const requested = [];
  let offline = true;
  const second = createCachedList({
    cacheKey,
    keyOf,
    async fetchPage(cursor) {
      requested.push(cursor);
      if (offline) throw Error('offline');
      if (cursor === null) return page(['c'], 'fresh');
      if (cursor === 'fresh') return page(['b'], 'tail');
      return page(['d']);
    },
  });
  await second.refresh();
  assert.deepEqual(ids(second), ['a', 'b']);
  assert.equal(second.getSnapshot().nextCursor, 'older');
  offline = false;
  await second.refresh();
  assert.deepEqual(requested, [null, null, 'fresh']);
  assert.deepEqual(ids(second), ['c', 'b']);
  assert.equal(second.getSnapshot().nextCursor, 'tail');
  await second.loadMore();
  assert.deepEqual(ids(second), ['c', 'b', 'd']);
});

test('a server response cannot undo a deletion or realtime insert made during a refresh', async () => {
  const { createCachedList } = fixture();
  let resolve;
  let requested = false;
  const list = createCachedList({
    cacheKey: 'conversations:alice',
    keyOf,
    fetchPage: () => {
      if (!requested) {
        requested = true;
        return Promise.resolve(page(['old', 'keep']));
      }
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  await list.refresh();
  const refresh = list.refresh();
  list.update((previous) => {
    const next = new Map(previous);
    next.delete('old');
    next.set('new', { id: 'new' });
    return next;
  });
  resolve(page(['old', 'keep']));
  await refresh;
  assert.deepEqual(ids(list), ['keep', 'new']);
});

test('a new message moves its conversation up and duplicates or older messages preserve its latest preview', () => {
  const { updateConversationForMessage, sortConversations } = load('conversation-list-state');
  const conversation = (id, type, date) => ({
    id,
    type,
    updatedAt: date,
    members: [{ userId: 'alice', unreadCount: 0 }],
    messages: [],
  });
  const initial = new Map([
    ['group', conversation('group', 'GROUP', '2026-11-20T12:00:00Z')],
    ['chat', conversation('chat', 'PRIVATE', '2026-11-20T11:00:00Z')],
  ]);
  const entry = { id: 'latest', conversationId: 'chat', createdAt: '2026-11-20T13:00:00Z' };
  const updated = updateConversationForMessage(initial, entry, 'alice', '', true);
  assert.deepEqual(
    sortConversations(updated.values()).map((item) => item.id),
    ['chat', 'group']
  );
  const repeated = updateConversationForMessage(updated, entry, 'alice', '', true);
  assert.equal(repeated.get('chat').members[0].unreadCount, 1);
  const older = updateConversationForMessage(
    repeated,
    { ...entry, id: 'older', createdAt: '2026-11-20T10:00:00Z' },
    'alice',
    '',
    true
  );
  assert.equal(older.get('chat').lastMessage.id, 'latest');
  assert.equal(sortConversations(older.values())[0].id, 'chat');
});
