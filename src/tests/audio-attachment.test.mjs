import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../components/chat/attachments/audio-attachment.tsx', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2023,
  },
});

async function fixture({
  duration = 12,
  seekable = true,
  decode,
  dispatchMetadata = true,
  failPlay = false,
} = {}) {
  const events = new Map();
  const timers = new Set();
  const reads = [];
  const retries = [];
  const notices = [];
  const bytes = new ArrayBuffer(8);
  const actions = [];
  const source = {
    url: 'blob:local-audio',
    blob: {
      async arrayBuffer() {
        reads.push('blob');
        return bytes;
      },
    },
  };
  let dispatch;
  let originalSrc;
  let src;
  const audio = {
    get src() {
      return src;
    },
    set src(value) {
      src = value;
      this.error = null;
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
    },
    paused: true,
    ended: false,
    error: null,
    duration,
    currentTime: 0,
    seekable: { length: seekable ? 1 : 0, start: () => 0, end: () => duration },
    addEventListener(event, handler, { signal } = {}) {
      events.set(event, handler);
      signal?.addEventListener('abort', () => events.delete(event), { once: true });
    },
    removeEventListener: (event) => events.delete(event),
    async play() {
      actions.push(['play', this.currentTime]);
      if (this.ended)
        throw new DOMException('Ended recording needs to be reopened', 'NotSupportedError');
      if (failPlay) {
        this.error = { code: 4 };
        dispatch('onError');
        return new Promise(() => {});
      }
      this.paused = false;
      dispatch('onPlay');
      dispatch('onPlaying');
    },
    pause() {
      actions.push(['pause', this.currentTime]);
      this.paused = true;
      dispatch('onPause');
    },
    load() {
      actions.push(['load']);
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
    },
    finish(time = this.duration) {
      this.currentTime = time;
      this.paused = true;
      this.ended = true;
      dispatch('onEnded');
    },
  };

  let stateIndex;
  let effectIndex;
  let pendingEffects;
  const state = [];
  const effectDeps = [];
  const cleanups = [];
  let refIndex;
  const refs = [];
  const callbacks = [];
  let callbackIndex;
  const hooks = {
    useCallback(callback) {
      return (callbacks[callbackIndex++] ??= callback);
    },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (value) => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = refIndex++;
      return (refs[index] ??= { current: initial });
    },
    useEffect(effect, deps) {
      const index = effectIndex++;
      const previous = effectDeps[index];
      if (previous?.length === deps.length && deps.every((value, i) => value === previous[i])) {
        return;
      }
      effectDeps[index] = deps;
      pendingEffects.push(() => {
        cleanups[index]?.();
        cleanups[index] = effect();
      });
    },
  };
  const module = { exports: {} };
  const dependencies = {
    react: hooks,
    'lucide-react': { Pause: 'Pause', Play: 'Play', LoaderCircle: 'LoaderCircle' },
    '@/hooks/use-attachment-source': {
      useAttachmentSource: () => ({ source, retry: () => retries.push('retry') }),
    },
  };
  new Function(
    'require',
    'module',
    'exports',
    'OfflineAudioContext',
    'console',
    'setTimeout',
    'clearTimeout',
    outputText
  )(
    (name) => dependencies[name] ?? require(name),
    module,
    module.exports,
    decode
      ? class {
          async decodeAudioData(data) {
            assert.equal(data, bytes);
            return decode();
          }
        }
      : undefined,
    { error: (...args) => notices.push(args) },
    (callback) => {
      timers.add(callback);
      return callback;
    },
    (callback) => timers.delete(callback)
  );
  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    const tree = module.exports.AudioAttachment({
      attachmentId: 'note',
      fileName: 'note',
      contentType: 'audio/mpeg',
    });
    const children = Array.isArray(tree.props.children) ? tree.props.children : [];
    const element = children.find((child) => child.type === 'audio');
    refs[0].current = element ? audio : null;
    if (element?.props.src !== originalSrc) {
      originalSrc = element?.props.src;
      if (element) audio.src = originalSrc;
    }
    pendingEffects.forEach((effect) => effect());
    return children;
  }

  function media() {
    return render().find((node) => node.type === 'audio').props;
  }
  dispatch = (eventName) => {
    events.get(eventName.slice(2).toLowerCase())?.();
    return media()[eventName]?.({ currentTarget: audio });
  };
  render();
  await Promise.resolve();
  if (dispatchMetadata) dispatch('onLoadedMetadata');
  else render();
  return {
    audio,
    actions,
    reads,
    retries,
    notices,
    measure: async () => {
      const scheduled = [...timers];
      timers.clear();
      await Promise.all(scheduled.map((callback) => callback()));
    },
    controls: () => render().find((node) => node.type === 'button').props,
    slider: () => render().find((node) => node.type === 'input').props,
    dispatch,
    media,
  };
}

test('web audio waits for a new click after ending and replays from the beginning', async () => {
  const { audio, actions, controls, media, slider } = await fixture({ seekable: false });
  assert.equal(media().preload, 'auto');
  assert.equal(media().loop, false);
  await controls().onClick();
  audio.finish();
  assert.equal(controls()['aria-label'], 'Reproducir');
  assert.equal(controls().disabled, false);
  assert.equal(slider().value, audio.duration);
  assert.deepEqual(actions, [['play', 0]]);

  await controls().onClick();
  audio.finish();
  await controls().onClick();
  assert.deepEqual(actions, [['play', 0], ['load'], ['play', 0], ['load'], ['play', 0]]);
});

test('pausing and resuming web audio keeps its current position', async () => {
  const { audio, actions, controls } = await fixture();
  await controls().onClick();
  audio.currentTime = 4;
  await controls().onClick();
  await controls().onClick();
  assert.deepEqual(actions, [
    ['play', 0],
    ['pause', 4],
    ['play', 4],
  ]);
});

test('late duration metadata and fractional endpoints keep the thumb aligned', async () => {
  const { audio, slider, dispatch } = await fixture({ duration: Infinity, seekable: false });
  assert.deepEqual(
    [slider().min, slider().max, slider().value, slider().disabled],
    [0, 0, 0, true]
  );

  audio.duration = 12.037;
  audio.seekable = { length: 1, start: () => 0, end: () => audio.duration };
  dispatch('onDurationChange');
  assert.equal(slider().max, 12.037);
  assert.equal(slider().step, 'any');

  audio.finish(12.03);
  assert.equal(slider().value, slider().max);
});

test('a WebM with no finite duration uses the elapsed time at the end', async () => {
  const { audio, slider, controls, actions } = await fixture({
    duration: Infinity,
    seekable: false,
  });
  await controls().onClick();
  audio.finish(9.321);
  assert.equal(slider().max, 9.321);
  assert.equal(slider().value, 9.321);
  await controls().onClick();
  assert.deepEqual(actions, [['play', 0], ['load'], ['play', 0]]);
});

test('calculates missing duration on first load without playing the attachment', async () => {
  const { measure, slider, actions, reads, controls } = await fixture({
    duration: Infinity,
    seekable: false,
    decode: async () => ({ duration: 17.125 }),
  });
  await measure();
  assert.equal(slider().max, 17.125);
  assert.equal(slider().value, 0);
  assert.deepEqual(reads, ['blob']);
  assert.deepEqual(actions, []);
  await controls().onClick();
  assert.deepEqual(actions, [['play', 0]]);
  assert.deepEqual(reads, ['blob']);
});

test('web audio surfaces local playback failure and retries through the attachment loader', async () => {
  const { audio, controls, retries, notices, reads } = await fixture({ failPlay: true });
  assert.equal(audio.src, 'blob:local-audio');
  await controls().onClick();
  assert.equal(notices.length, 1);
  assert.deepEqual(reads, []);
  assert.equal(controls().children, 'Reintentar');
  controls().onClick();
  assert.deepEqual(retries, ['retry']);
});

test('a native preload error reports failure on Play', async () => {
  const { audio, actions, controls, dispatch, retries } = await fixture();
  audio.error = { code: 4 };
  dispatch('onError');
  assert.equal(controls().disabled, false);

  await controls().onClick();
  assert.equal(controls().children, 'Reintentar');
  assert.deepEqual(actions, []);
  controls().onClick();
  assert.deepEqual(retries, ['retry']);
});

test('skips reading the local blob when the browser already knows the duration', async () => {
  const { measure, slider, reads } = await fixture({
    duration: 12.037,
    dispatchMetadata: false,
    decode: () => assert.fail('native metadata should suffice'),
  });
  await measure();
  assert.equal(slider().max, 12.037);
  assert.deepEqual(reads, []);
});

test('late native metadata takes priority over the pending decoded duration', async () => {
  let completeDecode;
  const { audio, dispatch, measure, reads, slider } = await fixture({
    duration: Infinity,
    seekable: false,
    decode: () => new Promise((resolve) => { completeDecode = resolve; }),
  });
  const probe = measure();
  await Promise.resolve();
  assert.deepEqual(reads, ['blob']);
  audio.duration = 14.035;
  dispatch('onDurationChange');
  completeDecode({ duration: 14.031 });
  await probe;
  assert.equal(slider().max, 14.035);
});
