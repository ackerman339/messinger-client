import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL('../components/chat/call-history-list.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'call-history-list.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const contactTypes = {};
new Function(
  'exports',
  ts.transpileModule(fs.readFileSync(new URL('../types/contact.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(contactTypes);

const dependencies = {
  '@/hooks/use-call-history': {},
  '@/context/user-context': {},
  '@/types/contact': contactTypes,
};
const loadCallHistory = new Function('require', 'module', 'exports', code);
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
const call = {
  id: 'call',
  callerId: 'alice',
  calleeId: 'bob',
  media: 'audio',
  status: 'ended',
  caller: { id: 'alice', username: 'Ana López' },
  callee: { id: 'bob', username: 'Bruno Pérez' },
  createdAt: '2026-11-14T12:00:00Z',
  acceptedAt: '2026-11-14T12:00:01Z',
  connectedAt: '2026-11-14T12:00:03Z',
  endedAt: '2026-11-14T12:01:08Z',
};
function render(item = call, userId = 'alice', contacts = new Map()) {
  const module = { exports: {} };
  loadCallHistory(
    (name) => {
      if (name === '@/context/contacts-context') {
        return { useContactsContext: () => ({ contacts }) };
      }
      return name in dependencies ? dependencies[name] : require(name);
    },
    module,
    module.exports,
  );
  return module.exports.CallHistoryRow({ call: item, userId, onDelete() {} });
}
test('outgoing history displays callee name and attended duration', () => {
  const result = text(render());
  assert.ok(result.includes('Bruno Pérez'));
  assert.ok(!result.includes('Ana López'));
  assert.ok(result.includes('Saliente'));
  assert.ok(result.includes('1:05'));
});
test('incoming history displays caller name and attended duration', () => {
  const result = text(render(call, 'bob'));
  assert.ok(result.includes('Ana López'));
  assert.ok(!result.includes('Bruno Pérez'));
  assert.ok(result.includes('Entrante'));
  assert.ok(result.includes('1:05'));
});
test('history uses the saved name of the other participant in either direction', () => {
  const contacts = new Map([
    ['alice', { name: 'Ana Trabajo', username: 'Ana López' }],
    ['bob', { name: 'Bruno Taller', username: 'Bruno Pérez' }],
  ]);
  const outgoing = text(render(call, 'alice', contacts));
  const incoming = text(render(call, 'bob', contacts));

  assert.ok(outgoing.includes('Bruno Taller'));
  assert.ok(!outgoing.includes('Bruno Pérez'));
  assert.ok(incoming.includes('Ana Trabajo'));
  assert.ok(!incoming.includes('Ana López'));
  assert.ok(text(render({ ...call, callee: null }, 'alice', contacts)).includes('Bruno Taller'));
});
test('missed calls show their result instead of an attended duration', () => {
  const missed = {
    ...call,
    status: 'missed',
    acceptedAt: null,
    connectedAt: null,
  };
  assert.ok(text(render(missed)).includes('Sin respuesta'));
  assert.ok(text(render(missed, 'bob')).includes('Perdida'));
  assert.ok(!text(render(missed)).includes('1:05'));
});
test('missing contacts have a fallback name and a short answered call shows zero duration', () => {
  const result = text(
    render({ ...call, callee: null, endedAt: call.connectedAt }),
  );
  assert.ok(result.includes('Usuario eliminado'));
  assert.ok(result.includes('0:00'));
});
