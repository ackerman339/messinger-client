import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(
  new URL('../hooks/use-cursor-pagination.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('refreshing an emptied chat invalidates an older page still in flight', async () => {
  const states = [],
    effects = [],
    pending = [];
  const react = {
    useState: (initial) => {
      const index = states.length;
      states.push(initial);
      return [
        initial,
        (update) => {
          states[index] =
            typeof update === 'function' ? update(states[index]) : update;
        },
      ];
    },
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (callback) => effects.push(callback),
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => {
      assert.equal(name, 'react');
      return react;
    },
    module,
    module.exports,
  );
  const history = module.exports.useCursorPagination({
    fetchPage: () => new Promise((resolve) => pending.push(resolve)),
    deps: ['chat'],
  });
  effects.forEach((effect) => effect());
  assert.equal(pending.length, 1);
  history.refresh();
  assert.equal(pending.length, 2);
  pending[1]({ page: [{ id: 'after-emptying' }], nextCursor: null });
  await flush();
  pending[0]({ page: [{ id: 'old-call-event' }], nextCursor: 'old' });
  await flush();
  assert.deepEqual(states[0], [{ id: 'after-emptying' }]);
  assert.equal(states[2], false);
  assert.equal(states[3], false);
});
