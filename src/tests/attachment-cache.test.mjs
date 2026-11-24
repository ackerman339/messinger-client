import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../services/attachment-cache.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } },
).outputText;

function fixture() {
  const records = new Map();
  const events = [];
  const navigator = { onLine: true };
  const session = new AbortController();
  let connectionInterrupted = false;

  function open() {
    const exports = {};
    const storage = {
      attachmentSession: () => session.signal,
      readCachedAttachment: async (accountId, id) => records.get(JSON.stringify([accountId, id])),
      writeCachedAttachment: async (accountId, id, blob) => records.set(JSON.stringify([accountId, id]), blob),
    };
    const fileService = {
      async downloadFile({ attachmentId }) {
        events.push(['signed', attachmentId]);
        return { url: `https://example.test/${attachmentId}` };
      },
      async downloadAudioBytes(attachmentId) {
        events.push(['audio', attachmentId]);
        return new TextEncoder().encode('voice').buffer;
      },
    };
    async function fetch(url) {
      events.push(['r2', url]);
      if (connectionInterrupted) throw new TypeError('Connection interrupted');
      return new Response('image');
    }

    new Function('exports', 'require', 'navigator', 'fetch', code)(
      exports,
      (id) => id === './attachment-storage' ? storage : { fileService },
      navigator,
      fetch,
    );
    return exports.loadAttachment;
  }

  return {
    open,
    events,
    records,
    offline: () => { navigator.onLine = false; },
    interrupt: () => { connectionInterrupted = true; },
    reconnect: () => { connectionInterrupted = false; },
  };
}

test('concurrent previews share one transfer and a reopened client reads the stored blob offline', async () => {
  const f = fixture();
  const load = f.open();
  const [preview, download] = await Promise.all([
    load('alice', 'photo', 'image/png'),
    load('alice', 'photo', 'image/png'),
  ]);

  assert.equal(preview, download);
  assert.equal(preview.type, 'image/png');
  assert.equal(await preview.text(), 'image');

  f.offline();
  const reopened = f.open();
  assert.equal(await (await reopened('alice', 'photo', 'image/png')).text(), 'image');
  await assert.rejects(reopened('bob', 'photo', 'image/png'), /sin conexión/);
  assert.deepEqual(f.events, [
    ['signed', 'photo'],
    ['r2', 'https://example.test/photo'],
  ]);
});

test('an interrupted transfer can be retried and never leaves an incomplete cache entry', async () => {
  const f = fixture();
  const load = f.open();
  f.interrupt();
  await assert.rejects(load('alice', 'photo', 'image/png'), /Connection interrupted/);
  assert.equal(f.records.size, 0);

  f.reconnect();
  assert.equal(await (await load('alice', 'photo', 'image/png')).text(), 'image');
  assert.equal(f.records.size, 1);
});

test('the audio API fallback saves playable bytes for future offline openings', async () => {
  const f = fixture();
  f.interrupt();
  const audio = await f.open()('alice', 'audio', 'audio/m4a');
  assert.equal(audio.type, 'audio/mp4');
  assert.equal(await audio.text(), 'voice');

  f.offline();
  const local = await f.open()('alice', 'audio', 'audio/m4a');
  assert.equal(await local.text(), 'voice');
  assert.deepEqual(f.events, [
    ['signed', 'audio'],
    ['r2', 'https://example.test/audio'],
    ['audio', 'audio'],
  ]);
});

test('the IndexedDB record expires after 72 hours even after a recent read', async () => {
  const storeCode = ts.transpileModule(
    readFileSync(new URL('../services/attachment-storage.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const records = new Map();
  let now = 100;
  const db = {
    transaction() {
      const transaction = {};
      function request(callback) {
        const result = {};
        queueMicrotask(() => {
          result.result = callback();
          result.onsuccess?.();
          transaction.oncomplete();
        });
        return result;
      }
      transaction.objectStore = () => ({
        get: (key) => request(() => records.get(JSON.stringify(key))),
        put: (record) => request(() => records.set(
          JSON.stringify([record.accountId, record.attachmentId]), record,
        )),
        delete: (key) => records.delete(JSON.stringify(key)),
      });
      return transaction;
    },
  };
  const indexedDB = {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  const store = {};
  new Function('exports', 'indexedDB', 'Date', storeCode)(store, indexedDB, { now: () => now });

  const blob = new Blob(['photo']);
  const original = now;
  await store.writeCachedAttachment('alice', 'photo', blob, store.attachmentSession('alice'));
  now = original + 72 * 60 * 60 * 1000 - 1;
  assert.equal(await store.readCachedAttachment('alice', 'photo'), blob);
  now++;
  assert.equal(await store.readCachedAttachment('alice', 'photo'), undefined);
  assert.equal(records.size, 0);
});
