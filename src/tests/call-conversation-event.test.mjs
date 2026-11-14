import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL('../components/chat/conversation-event-message.tsx', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  fileName: 'conversation-event-message.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  (name) =>
    name === 'lucide-react-native'
      ? {
          Phone: 'Phone',
          Video: 'Video',
          ArrowUpRight: 'ArrowUpRight',
          ArrowDownLeft: 'ArrowDownLeft',
        }
      : name === 'tamagui'
        ? { Text: 'Text', YStack: 'YStack', XStack: 'XStack' }
        : require(name),
  module,
  module.exports,
);
const { ConversationEventMessage } = module.exports;
function text(node) {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'object') return text(node.props.children);
  return String(node);
}
function render(type, metadata) {
  return text(
    ConversationEventMessage({
      message: { type, metadata, createdAt: '2026-11-14T12:00:00Z' },
    }),
  );
}
test('accepted call cards show duration, including a zero-second call', () => {
  assert.ok(
    render('CALL_ACCEPTED', { media: 'video', durationSeconds: 65 }).startsWith(
      'Videollamada1:05',
    ),
  );
  assert.ok(
    render('CALL_ACCEPTED', { media: 'audio', durationSeconds: 0 }).startsWith(
      'Llamada de voz0:00',
    ),
  );
});
test('unanswered call cards display the outcome', () => {
  for (const [status, label] of [
    ['missed', 'Perdida'],
    ['rejected', 'Rechazada'],
    ['failed', 'No se pudo conectar'],
  ]) {
    assert.ok(render('CALL_END', { status }).includes(label));
  }
});
