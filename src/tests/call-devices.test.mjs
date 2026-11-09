import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const { replaceCamera } = await load('../rtc/camera-switcher.ts');
const { createCallAudioOutput, getPhoneAudioOutputs } = await load(
  '../services/call-audio-output.ts',
);
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
function mockNavigator(t, mediaDevices) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  });
}
function track(kind, deviceId, facingMode) {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    onended: null,
    getSettings: () => ({ deviceId, facingMode }),
    stop() {
      this.readyState = 'ended';
    },
  };
}
function stream(tracks) {
  return {
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((item) => item.kind === 'video'),
    removeTrack(item) {
      tracks.splice(tracks.indexOf(item), 1);
    },
    addTrack(item) {
      tracks.push(item);
    },
  };
}
function cameraSetup(t, facingMode) {
  const old = track('video', 'front', facingMode);
  const microphone = track('audio', 'mic');
  const local = stream([microphone, old]);
  const requested = [];
  const replaced = [];
  const created = [];
  const sender = {
    track: old,
    async replaceTrack(next) {
      replaced.push(next);
      this.track = next;
    },
  };
  const mediaDevices = {
    enumerateDevices: async () =>
      ['front', 'back'].map((deviceId) => ({ kind: 'videoinput', deviceId })),
    getUserMedia: async (constraints) => {
      requested.push(constraints);
      const next = track(
        'video',
        constraints.video.deviceId?.exact ?? 'back',
        constraints.video.facingMode?.exact,
      );
      created.push(next);
      return stream([next]);
    },
  };
  mockNavigator(t, mediaDevices);
  let active = true;
  let changes = 0;
  let unavailable = 0;
  const options = {
    peer: { getSenders: () => [sender] },
    stream: local,
    isActive: () => active,
    onChange: () => {
      changes++;
    },
    onUnavailable: () => {
      unavailable++;
    },
  };
  return {
    old,
    microphone,
    local,
    sender,
    mediaDevices,
    requested,
    replaced,
    created,
    switch: () => replaceCamera(options),
    end: () => {
      active = false;
    },
    get changes() {
      return changes;
    },
    get unavailable() {
      return unavailable;
    },
  };
}
test('desktop camera switch replaces video, updates preview and leaves the microphone running', async (t) => {
  const camera = cameraSetup(t);
  await camera.switch();
  assert.deepEqual(camera.requested, [{ audio: false, video: { deviceId: { exact: 'back' } } }]);
  assert.equal(camera.old.readyState, 'ended');
  assert.equal(camera.replaced[0], camera.created[0]);
  assert.deepEqual(camera.local.getTracks(), [camera.microphone, camera.created[0]]);
  assert.equal(camera.microphone.readyState, 'live');
  assert.equal(camera.changes, 1);
});
test('front and rear cameras alternate while preserving a disabled camera', async (t) => {
  const camera = cameraSetup(t, 'user');
  camera.old.enabled = false;
  await camera.switch();
  await camera.switch();
  assert.equal(camera.requested[0].video.facingMode.exact, 'environment');
  assert.equal(camera.requested[1].video.facingMode.exact, 'user');
  assert.equal(camera.local.getVideoTracks()[0].enabled, false);
  assert.equal(camera.microphone.readyState, 'live');
});
test('a desktop camera reporting user facingMode can fall back to another webcam', async (t) => {
  const camera = cameraSetup(t, 'user');
  const capture = camera.mediaDevices.getUserMedia;
  camera.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints.video.facingMode)
      throw new DOMException('No rear camera', 'OverconstrainedError');
    return capture(constraints);
  };
  await camera.switch();
  assert.equal(camera.requested[0].video.deviceId.exact, 'back');
});
test('one desktop camera reports that there is no alternative without releasing it', async (t) => {
  const camera = cameraSetup(t);
  camera.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'front' }];
  await assert.rejects(camera.switch(), /No hay otra cámara/);
  assert.equal(camera.old.readyState, 'live');
  assert.equal(camera.requested.length, 0);
});
test('denying the replacement camera keeps the previous camera and microphone live', async (t) => {
  const camera = cameraSetup(t);
  camera.mediaDevices.getUserMedia = async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  };
  await assert.rejects(camera.switch(), /Denied/);
  assert.equal(camera.old.readyState, 'live');
  assert.equal(camera.microphone.readyState, 'live');
  assert.equal(camera.replaced.length, 0);
});
test('a replaceTrack failure releases the new camera and retains the old one', async (t) => {
  const camera = cameraSetup(t);
  camera.sender.replaceTrack = async () => {
    throw new DOMException('Requires negotiation', 'InvalidModificationError');
  };
  await assert.rejects(camera.switch(), /Requires negotiation/);
  assert.equal(camera.created[0].readyState, 'ended');
  assert.equal(camera.old.readyState, 'live');
  assert.equal(camera.changes, 0);
});
test('an exclusive camera is restored if switching fails after releasing it', async (t) => {
  const camera = cameraSetup(t);
  const capture = camera.mediaDevices.getUserMedia;
  let attempts = 0;
  camera.mediaDevices.getUserMedia = async (constraints) => {
    if (++attempts <= 2) throw new DOMException('Camera busy', 'NotReadableError');
    assert.equal(constraints.video.deviceId.exact, 'front');
    return capture(constraints);
  };
  await assert.rejects(camera.switch(), /Camera busy/);
  assert.equal(camera.old.readyState, 'ended');
  assert.equal(camera.local.getVideoTracks()[0].getSettings().deviceId, 'front');
  assert.equal(camera.local.getVideoTracks()[0].readyState, 'live');
  assert.equal(camera.microphone.readyState, 'live');
  assert.equal(camera.unavailable, 0);
});
test('hanging up during camera acquisition releases a late camera without publishing it', async (t) => {
  const camera = cameraSetup(t);
  let resolve;
  camera.mediaDevices.getUserMedia = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = camera.switch();
  await flush();
  camera.end();
  const late = track('video', 'back');
  resolve(stream([late]));
  await pending;
  assert.equal(late.readyState, 'ended');
  assert.equal(camera.replaced.length, 0);
  assert.equal(camera.changes, 0);
});
test('hanging up during replaceTrack releases a late camera without updating the preview', async (t) => {
  const camera = cameraSetup(t);
  let resolve;
  camera.sender.replaceTrack = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = camera.switch();
  await flush();
  camera.end();
  resolve();
  await pending;
  assert.equal(camera.created[0].readyState, 'ended');
  assert.equal(camera.changes, 0);
});

const phoneDevices = [
  { kind: 'audiooutput', deviceId: 'speaker-id', label: 'Speaker' },
  { kind: 'audiooutput', deviceId: 'receiver-id', label: 'Earpiece' },
];

function audioSetup(t, { supported = true, devices = phoneDevices } = {}) {
  const previous = globalThis.HTMLMediaElement;
  globalThis.HTMLMediaElement = function () {};
  if (supported) HTMLMediaElement.prototype.setSinkId = async () => {};
  t.after(() => {
    globalThis.HTMLMediaElement = previous;
  });
  let available = devices;
  const listeners = new Map();
  const mediaDevices = {
    enumerateDevices: async () => available,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event) => listeners.delete(event),
  };
  mockNavigator(t, mediaDevices);
  const routed = [];
  const element = {
    sinkId: '',
    setSinkId: async (id) => {
      routed.push(id);
      element.sinkId = id;
    },
  };
  const output = createCallAudioOutput();
  output.attach(element);
  const stop = output.start();
  t.after(stop);
  return {
    output,
    element,
    routed,
    stop,
    listeners,
    mediaDevices,
    setDevices: (value) => {
      available = value;
    },
  };
}

test('only distinct, explicitly identified built-in speaker and receiver enable the toggle', () => {
  assert.deepEqual(getPhoneAudioOutputs(phoneDevices), {
    speaker: 'speaker-id',
    earpiece: 'receiver-id',
  });
  assert.deepEqual(
    getPhoneAudioOutputs([
      { deviceId: 's', label: 'Built-In Speaker' },
      { deviceId: 'e', label: 'Built-In Receiver' },
    ]),
    { speaker: 's', earpiece: 'e' },
  );
  assert.deepEqual(
    getPhoneAudioOutputs([
      { deviceId: 's', label: 'Altavoz integrado' },
      { deviceId: 'e', label: 'Auricular interno' },
    ]),
    { speaker: 's', earpiece: 'e' },
  );
});
for (const devices of [
  [phoneDevices[0]],
  [phoneDevices[1]],
  [
    { deviceId: 'a', label: '' },
    { deviceId: 'b', label: '' },
  ],
  [
    { deviceId: 'a', label: 'Output 1' },
    { deviceId: 'b', label: 'Output 2' },
  ],
  [phoneDevices[0], { deviceId: 'headset', label: 'Headphones' }],
  [phoneDevices[0], { deviceId: 'headset', label: 'Auriculares' }],
  [phoneDevices[0], { deviceId: 'headset', label: 'Bluetooth Earpiece' }],
  [phoneDevices[0], { deviceId: 'headset', label: 'USB Receiver' }],
  [phoneDevices[1], { deviceId: 'bluetooth', label: 'Bluetooth Speaker' }],
  [phoneDevices[1], { deviceId: 'usb', label: 'USB Speaker' }],
  [phoneDevices[0], { deviceId: 'default', label: 'Earpiece' }],
  [phoneDevices[0], { deviceId: 'communications', label: 'Earpiece' }],
  [
    { deviceId: 'same', label: 'Speaker' },
    { deviceId: 'same', label: 'Earpiece' },
  ],
  [...phoneDevices, { deviceId: 'another', label: 'Earpiece' }],
]) {
  test(`ambiguous or non-phone outputs do not enable the toggle: ${JSON.stringify(devices)}`, () => {
    assert.equal(getPhoneAudioOutputs(devices), undefined);
  });
}
test('phone audio starts on speaker and alternates only after setSinkId succeeds', async (t) => {
  const { output, routed, element } = audioSetup(t);
  await flush();
  assert.equal(output.getSnapshot().canToggle, true);
  assert.equal(output.getSnapshot().route, 'speaker');
  await output.toggle();
  assert.equal(output.getSnapshot().route, 'earpiece');
  assert.equal(element.sinkId, 'receiver-id');
  await output.toggle();
  assert.equal(output.getSnapshot().route, 'speaker');
  assert.deepEqual(routed, ['speaker-id', 'receiver-id', 'speaker-id']);
});
test('a browser without setSinkId leaves playback and controls unchanged', async (t) => {
  const { output, routed } = audioSetup(t, { supported: false });
  await flush();
  await output.toggle();
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(output.getSnapshot().route, undefined);
  assert.deepEqual(routed, []);
});
test('a sole speaker remains selected without offering an earpiece button', async (t) => {
  const { output, routed } = audioSetup(t, { devices: [phoneDevices[0]] });
  await flush();
  await output.toggle();
  assert.equal(output.getSnapshot().canToggle, false);
  assert.deepEqual(routed, ['speaker-id']);
});
test('permission revealing device labels enables the toggle after detection is refreshed', async (t) => {
  const { output, setDevices, routed } = audioSetup(t, {
    devices: phoneDevices.map((device) => ({ ...device, label: '' })),
  });
  await flush();
  assert.equal(output.getSnapshot().canToggle, false);
  setDevices(phoneDevices);
  await output.refresh();
  assert.equal(output.getSnapshot().canToggle, true);
  assert.deepEqual(routed, ['', 'speaker-id']);
});
test('denied earpiece routing retains the speaker state and reports the error', async (t) => {
  const { output, element } = audioSetup(t);
  await flush();
  element.setSinkId = async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  };
  await output.toggle();
  assert.equal(output.getSnapshot().route, 'speaker');
  assert.match(output.getSnapshot().error, /no permitió/);
  assert.equal(output.getSnapshot().busy, false);
});
test('failure of the initial speaker selection does not advertise a working toggle', async (t) => {
  const { output, element } = audioSetup(t);
  element.setSinkId = async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  };
  await flush();
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(output.getSnapshot().route, undefined);
  assert.match(output.getSnapshot().error, /no permitió/);
});
test('losing the earpiece removes the button and restores the exposed speaker', async (t) => {
  const { output, routed, element, setDevices, listeners } = audioSetup(t);
  await flush();
  await output.toggle();
  setDevices([phoneDevices[0]]);
  listeners.get('devicechange')();
  await flush();
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(element.sinkId, 'speaker-id');
  assert.deepEqual(routed, ['speaker-id', 'receiver-id', 'speaker-id']);
});
test('enumeration failure invalidates a previously available pair', async (t) => {
  const { output, mediaDevices, element } = audioSetup(t);
  await flush();
  await output.toggle();
  mediaDevices.enumerateDevices = async () => {
    throw new DOMException('Unavailable', 'NotAllowedError');
  };
  await output.refresh();
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(element.sinkId, '');
});
test('an unchanged device list preserves an earpiece selected by the user', async (t) => {
  const { output, routed } = audioSetup(t);
  await flush();
  await output.toggle();
  await output.refresh();
  assert.equal(output.getSnapshot().route, 'earpiece');
  assert.deepEqual(routed, ['speaker-id', 'receiver-id']);
});
test('the selected route is reapplied when remote playback moves to another element', async (t) => {
  const { output } = audioSetup(t);
  await flush();
  await output.toggle();
  output.attach(null);
  const routed = [];
  output.attach({
    setSinkId: async (id) => {
      routed.push(id);
    },
  });
  await flush();
  assert.deepEqual(routed, ['receiver-id']);
  assert.equal(output.getSnapshot().route, 'earpiece');
});
test('a disappearing receiver during a switch is followed by speaker fallback', async (t) => {
  const { output, element, setDevices, routed } = audioSetup(t);
  await flush();
  const apply = element.setSinkId;
  let resolve;
  element.setSinkId = (id) =>
    id === 'receiver-id'
      ? new Promise((done) => {
          resolve = done;
        })
      : apply(id);
  const pending = output.toggle();
  setDevices([phoneDevices[0]]);
  await output.refresh();
  resolve();
  await pending;
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(element.sinkId, 'speaker-id');
  assert.deepEqual(routed, ['speaker-id', 'speaker-id']);
});
test('a double click cannot start parallel route changes', async (t) => {
  const { output, element } = audioSetup(t);
  await flush();
  let resolve;
  let changes = 0;
  element.setSinkId = () => {
    changes++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const pending = output.toggle();
  await output.toggle();
  assert.equal(changes, 1);
  assert.equal(output.getSnapshot().busy, true);
  resolve();
  await pending;
  assert.equal(output.getSnapshot().route, 'earpiece');
});
test('ending a call ignores late route changes and removes device listeners', async (t) => {
  const { output, element, stop, listeners } = audioSetup(t);
  await flush();
  let resolve;
  element.setSinkId = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = output.toggle();
  stop();
  resolve();
  await pending;
  assert.equal(output.getSnapshot().canToggle, false);
  assert.equal(output.getSnapshot().route, undefined);
  assert.equal(output.getSnapshot().busy, false);
  assert.equal(listeners.size, 0);
});
