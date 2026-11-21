import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../hooks/use-status-playback.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
});

function fixture() {
  const hooks = [];
  const intervals = new Map();
  const effects = [];
  let clock = 0;
  let hookIndex = 0;
  let timerIndex = 0;
  const react = {
    useState(initial) {
      const index = hookIndex++;
      hooks[index] ??= { value: initial };
      return [
        hooks[index].value,
        (value) => {
          hooks[index].value = value;
        },
      ];
    },
    useRef(value) {
      const index = hookIndex++;
      return (hooks[index] ??= { current: value });
    },
    useEffect(effect, deps) {
      const index = hookIndex++;
      if (hooks[index]?.deps.every((value, i) => Object.is(value, deps[i]))) return;
      effects.push(() => {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      });
    },
  };

  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    'performance',
    'setInterval',
    'clearInterval',
    outputText,
  )(
    () => react,
    module,
    module.exports,
    { now: () => clock },
    (tick) => {
      intervals.set(++timerIndex, tick);
      return timerIndex;
    },
    (timer) => intervals.delete(timer),
  );
  return {
    progress: module.exports.statusProgress,
    render(playing, onEnd) {
      hookIndex = 0;
      const progress = module.exports.useTimedStatusProgress(1000, playing, onEnd);
      for (const effect of effects.splice(0)) effect();
      return progress;
    },
    tick(milliseconds) {
      clock += milliseconds;
      for (const interval of [...intervals.values()]) interval();
    },
    timers: () => intervals.size,
  };
}

test('timed statuses wait until ready, resume from the previous position, and advance once', () => {
  const f = fixture();
  let ended = 0;
  const onEnd = () => {
    ended++;
  };

  assert.equal(f.render(false, onEnd), 0);
  assert.equal(f.timers(), 0);
  f.tick(3000);
  assert.equal(f.render(true, onEnd), 0);
  f.tick(400);
  assert.equal(f.render(false, onEnd), 0.4);
  f.tick(2000);
  assert.equal(f.render(true, onEnd), 0.4);
  f.tick(300);
  assert.equal(f.render(true, onEnd), 0.7);
  f.tick(400);
  assert.equal(f.render(true, onEnd), 1);
  assert.equal(f.timers(), 0);
  f.tick(400);
  assert.equal(ended, 1);
});

test('refreshing the feed updates the advance callback without restarting the clock', () => {
  const f = fixture();
  f.render(true, () => assert.fail('stale advance callback'));
  f.tick(500);
  let ended = false;
  assert.equal(
    f.render(true, () => {
      ended = true;
    }),
    0.5,
  );
  f.tick(500);
  assert.equal(ended, true);
  assert.equal(f.timers(), 0);
});

test('video progress follows playback time and handles unloaded or ended media', () => {
  const { progress } = fixture();
  assert.equal(progress(2, 8), 0.25);
  assert.equal(progress(0, 0), 0);
  assert.equal(progress(1, Infinity), 0);
  assert.equal(progress(-1, 10), 0);
  assert.equal(progress(11, 10), 1);
});

function loadVideo({ react, hooks }) {
  const path = '../components/chat/statuses-panel.tsx';
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + '\nexport { StatusVideo };';
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (dependency) => {
      if (dependency === 'react') return react;
      if (dependency === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (dependency.endsWith('/hooks/use-status-playback')) return hooks;
      return {};
    },
    module,
    module.exports,
  );
  return module.exports.StatusVideo;
}

test('web status video retries autoplay muted and reports the current position', async () => {
  const attempts = [];
  const player = {
    muted: false,
    async play() {
      attempts.push(this.muted);
      if (!this.muted) throw new DOMException('Blocked', 'NotAllowedError');
    },
  };
  const StatusVideo = loadVideo({
    react: { useRef: () => ({ current: player }), useEffect: (effect) => effect() },
    hooks: { statusProgress: fixture().progress },
  });
  const progress = [];
  let ended = false;
  const video = StatusVideo({
    url: 'https://example.invalid/status/video',
    onProgress: (value) => progress.push(value),
    onEnd: () => {
      ended = true;
    },
  });
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.deepEqual(attempts, [false, true]);
  video.props.onTimeUpdate({ currentTarget: { currentTime: 3, duration: 6 } });
  assert.deepEqual(progress, [0.5]);
  video.props.onEnded();
  assert.equal(ended, true);
});
