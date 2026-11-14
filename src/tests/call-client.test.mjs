import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const events = new Map();
const sent = [];
const ws = {
  on(event, handler) { events.set(event, handler); return () => events.delete(event); },
  emit(type, data) { sent.push({ type, data }); },
};
globalThis.__callTestWs = ws;
globalThis.__callTestHttp = { get: async () => ({ data: { iceServers: [] } }) };
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const moduleUrls = new Map();
function loadModuleUrl(url) {
  if (moduleUrls.has(url.href)) return moduleUrls.get(url.href);
  const source = fs.readFileSync(url, 'utf8')
    .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))
    .replace(/import \{ wsClient \}[^;]+;/, 'const wsClient = globalThis.__callTestWs;')
    .replace(/import \{ httpClient \}[^;]+;/, 'const httpClient = globalThis.__callTestHttp;');
  let compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  compiled = compiled.replace(/from ['"](\.[^'"]+)['"]/g, (_, path) => {
    return `from '${loadModuleUrl(new URL(`${path}.ts`, url))}'`;
  });
  const result = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  moduleUrls.set(url.href, result);
  return result;
}
const { createCallClient } = await import(loadModuleUrl(new URL('../clients/call-client.ts', import.meta.url)));
let tick;
const { sdpHash } = await import(loadModuleUrl(new URL('../signaling/sdp-hash.ts', import.meta.url)));
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup(t) {
  sent.length = 0;
  const client = createCallClient();
  const originalSetInterval = globalThis.setInterval;
  let dispose;
  try {
    globalThis.setInterval = callback => { tick = callback; return 0; };
    dispose = client.mount();
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
  t.after(dispose); return client;
}
const incoming = { callId: 'call', callerId: 'other', media: 'audio', expiresAt: null };
const accept = { callId: 'call', status: 'accepted', isSelectedConnection: true, connectionExpiresAt: null, shouldInitiateNegotiation: false };
const offer = { callId: 'call', negotiationId: 'n1', negotiationType: 'INITIAL', sdp: 'v=0\r\na=ice-ufrag:abc\r\n' };
let peers;
let media;
function mockMedia(video = false) {
  peers = [];
  class Stream {
    constructor(tracks = []) { this.tracks = [...tracks]; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track); }
    getTracks() { return this.tracks; }
    addTrack(track) { this.tracks.push(track); }
  }
  globalThis.MediaStream = Stream;
  globalThis.RTCPeerConnection = class {
    connectionState = 'new'; remoteDescription = null; localDescription = null; added = []; applied = 0; answers = 0;
    constructor() { peers.push(this); }
    senders = [];
    addTrack(track) { this.senders.push({ track, async replaceTrack(next) { this.track = next; } }); }
    getSenders() { return this.senders; }
    async setRemoteDescription(value) { this.applied++; this.remoteDescription = value; }
    async setLocalDescription(value) { this.localDescription = value; }
    async createAnswer() { this.answers++; return { type: 'answer', sdp: 'answer' }; }
    async addIceCandidate(value) { this.added.push(value); }
    close() { this.closed = true; }
  };
  const stream = new Stream(); stream.addTrack({ kind: 'audio', enabled: true, readyState: 'live', stop() { this.stopped = true; } });
  if (video) stream.addTrack({ kind: 'video', enabled: true, readyState: 'live', getSettings: () => ({ deviceId: 'front' }), stop() { this.stopped = true; this.readyState = 'ended'; } });
  media = stream;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
}
async function selectedOffer(t, mediaType = 'audio') {
  mockMedia(mediaType === 'video'); const client = setup(t);
  events.get('CALL_INCOMING')({ ...incoming, media: mediaType }); events.get('CALL_ACCEPT')(accept);
  const signal = { ...offer, signalId: await sdpHash(offer.sdp) };
  events.get('CALL_OFFER')(signal);
  const sync = sent.findLast(item => item.type === 'CALL_SYNC');
  events.get('CALL_STATE')({ syncId: sync.data.syncId,
    call: { ...incoming, media: mediaType, status: 'accepted', isSelectedConnection: true, isTerminal: false, currentNegotiationId: 'n1' },
    negotiation: { negotiationId: 'n1', status: 'OFFERED', type: 'INITIAL', expiresAt: null } });
  await flush(); return { client, signal };
}
test('outgoing calls use the CALL_INIT wire event registered by the backend', t => {
  const client = setup(t);
  const calleeId = '8cd0f520-5635-4e11-a313-3a97025eea3c';
  client.start(calleeId, 'audio');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'CALL_INIT');
  assert.deepEqual(Object.keys(sent[0].data).sort(), ['calleeId', 'media', 'requestId']);
  assert.equal(sent[0].data.calleeId, calleeId);
  assert.equal(sent[0].data.media, 'audio');
  assert.match(sent[0].data.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  events.get('CALL_CREATED')({ callId: 'call', calleeId, media: 'audio', status: 'ringing' });
  assert.equal(client.getSnapshot().callId, 'call');
  assert.equal(client.getSnapshot().status, 'ringing');
});
test('SHA-256 hashes exact UTF-8 SDP', async () => {
  assert.equal(await sdpHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(await sdpHash('abc\n'), await sdpHash('abc\r\n'));
});
test('cancel before CALL_CREATED ends the late call without reopening', t => {
  const client = setup(t); client.start('other', 'audio'); client.end();
  events.get('CALL_CREATED')({ callId: 'call', calleeId: 'other', status: 'ringing' });
  assert.equal(client.getSnapshot().status, 'ended');
  assert.equal(sent.filter(item => item.type === 'CALL_END').length, 1);
});
test('secondary device never creates a peer or reserves a negotiation', t => {
  mockMedia(); const client = setup(t); events.get('CALL_INCOMING')(incoming);
  events.get('CALL_ACCEPT')({ ...accept, isSelectedConnection: false, shouldInitiateNegotiation: true });
  assert.equal(client.getSnapshot().selected, false);
  assert.equal(peers.length, 0);
  assert.ok(!sent.some(item => item.type === 'CALL_NEGOTIATION_INIT'));
});
test('duplicate offers apply once, acknowledge twice, and create one answer', async t => {
  const { signal } = await selectedOffer(t);
  events.get('CALL_OFFER')(signal); events.get('CALL_OFFER')(signal); await flush();
  assert.equal(peers[0].applied, 1); assert.equal(peers[0].answers, 1);
  assert.equal(sent.filter(item => item.type === 'CALL_SIGNAL_ACK').length, 3);
});
test('early ICE waits for SDP and stale generation is discarded', async t => {
  mockMedia(); setup(t); events.get('CALL_INCOMING')(incoming); events.get('CALL_ACCEPT')(accept);
  events.get('CALL_ICE_CANDIDATE')({ callId: 'call', negotiationId: 'n1', candidate: { candidate: 'early', usernameFragment: 'abc' } });
  events.get('CALL_ICE_CANDIDATE')({ callId: 'call', negotiationId: 'n1', candidate: { candidate: 'old', usernameFragment: 'old' } });
  events.get('CALL_OFFER')({ ...offer, signalId: await sdpHash(offer.sdp) });
  const sync = sent.findLast(item => item.type === 'CALL_SYNC');
  events.get('CALL_STATE')({ syncId: sync.data.syncId, call: { ...incoming, status: 'accepted', isSelectedConnection: true, currentNegotiationId: 'n1' }, negotiation: { negotiationId: 'n1', type: 'INITIAL', status: 'OFFERED' } });
  await flush(); assert.deepEqual(peers[0].added, [{ candidate: 'early', usernameFragment: 'abc' }]);
});
test('terminal cleanup stops media and ignores late sync', async t => {
  const { client } = await selectedOffer(t);
  events.get('CALL_END')({ callId: 'call' });
  assert.ok(peers[0].closed); assert.ok(media.getTracks()[0].stopped);
  events.get('CALL_STATE')({ syncId: sent.findLast(item => item.type === 'CALL_SYNC').data.syncId, call: { callId: 'call', status: 'connected' } });
  assert.equal(client.getSnapshot().status, 'ended');
});
test('late permission result is stopped after cancellation', async t => {
  mockMedia(); setup(t); let resolveMedia;
  navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { resolveMedia = resolve; });
  events.get('CALL_INCOMING')(incoming); events.get('CALL_ACCEPT')(accept);
  events.get('CALL_OFFER')({ ...offer, signalId: await sdpHash(offer.sdp) });
  events.get('CALL_STATE')({ syncId: sent.findLast(item => item.type === 'CALL_SYNC').data.syncId, call: { ...incoming, status: 'accepted', isSelectedConnection: true, currentNegotiationId: 'n1' }, negotiation: { negotiationId: 'n1', type: 'INITIAL' } });
  await flush(); events.get('CALL_END')({ callId: 'call' }); resolveMedia(media); await flush();
  assert.ok(media.getTracks()[0].stopped); assert.equal(peers.length, 0);
  assert.ok(!sent.some(item => item.type === 'CALL_ANSWER'));
});
test('server snapshot after missed end releases the peer and media', async t => {
  const { client } = await selectedOffer(t);
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => originalNow() + 6000;
  tick();
  events.get('CALL_STATE')({
    syncId: sent.findLast(item => item.type === 'CALL_SYNC').data.syncId,
    call: { ...incoming, status: 'ended', isTerminal: true, isSelectedConnection: false },
    negotiation: null,
  });
  assert.ok(peers[0].closed);
  assert.ok(media.getTracks()[0].stopped);
  assert.equal(client.getSnapshot().status, 'ended');
});
test('SDP retries reuse exact bytes and stop after acknowledgment', async t => {
  await selectedOffer(t);
  const first = sent.find(item => item.type === 'CALL_ANSWER');
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => originalNow() + 2500;
  tick();
  const answers = sent.filter(item => item.type === 'CALL_ANSWER');
  assert.equal(answers.length, 2); assert.deepEqual(answers[1], first);
  events.get('CALL_SIGNAL_ACK')({ callId: 'call', negotiationId: 'n1', signalType: 'CALL_ANSWER', signalId: await sdpHash('answer') });
  Date.now = () => originalNow() + 5000;
  tick();
  assert.equal(sent.filter(item => item.type === 'CALL_ANSWER').length, 2);
});
test('negotiation completion and one connectivity report do not imply server connected', async t => {
  const { client } = await selectedOffer(t);
  events.get('CALL_NEGOTIATION_COMPLETED')({ callId: 'call', negotiationId: 'n1', status: 'COMPLETED' });
  assert.equal(client.getSnapshot().status, 'accepted');
  peers[0].connectionState = 'connected'; peers[0].onconnectionstatechange();
  assert.equal(sent.filter(item => item.type === 'CALL_CONNECTED').length, 1);
  assert.equal(client.getSnapshot().status, 'accepted');
  events.get('CALL_CONNECTED')({ callId: 'call', status: 'connected', connectedAt: new Date().toISOString() });
  assert.equal(client.getSnapshot().status, 'connected');
});
test('events from a retired negotiation cannot modify the current peer', async t => {
  const { signal } = await selectedOffer(t);
  const nextOffer = { ...offer, negotiationId: 'n2', sdp: 'v=0\r\na=ice-ufrag:new\r\n' };
  events.get('CALL_OFFER')({ ...nextOffer, signalId: await sdpHash(nextOffer.sdp) });
  events.get('CALL_STATE')({
    syncId: sent.findLast(item => item.type === 'CALL_SYNC').data.syncId,
    call: { ...incoming, status: 'accepted', isSelectedConnection: true, currentNegotiationId: 'n2' },
    negotiation: { negotiationId: 'n2', type: 'MEDIA_CHANGE', status: 'OFFERED' },
  });
  await flush();
  const applied = peers[0].applied;
  events.get('CALL_OFFER')(signal);
  events.get('CALL_ICE_CANDIDATE')({ callId: 'call', negotiationId: 'n1', candidate: null });
  await flush();
  assert.equal(applied, 2);
  assert.equal(peers[0].applied, applied);
});

const { createCallRingtone, getCallSound } = await import(loadModuleUrl(new URL('../services/call-ringtone.ts', import.meta.url)));
function mockRingtone(t, play) {
  const previous = globalThis.Audio;
  const audio = { currentTime: 9, pauses: 0, play, pause() { this.pauses++; } };
  globalThis.Audio = function (url) { audio.url = url; return audio; };
  t.after(() => { globalThis.Audio = previous; });
  return audio;
}
test('incoming ringtone loops and stops with its playback position reset', async t => {
  const audio = mockRingtone(t, async () => {});
  const ringtone = createCallRingtone();
  assert.equal(await ringtone.play(), true);
  assert.equal(audio.loop, true);
  assert.equal(audio.url, '/sounds/incoming-call.wav');
  ringtone.stop();
  assert.equal(audio.pauses, 1);
  assert.equal(audio.currentTime, 0);
  assert.equal(await ringtone.play(), false);
});
test('ringtone reports blocked autoplay and allows retry after interaction', async t => {
  let allowed = false;
  mockRingtone(t, async () => { if (!allowed) throw new Error('NotAllowedError'); });
  const ringtone = createCallRingtone();
  assert.equal(await ringtone.play(), false);
  allowed = true;
  assert.equal(await ringtone.play(), true);
  ringtone.stop();
});
test('stopping an incoming call silences a late playback result', async t => {
  let resolvePlayback;
  const audio = mockRingtone(t, () => new Promise(resolve => { resolvePlayback = resolve; }));
  const ringtone = createCallRingtone();
  const playing = ringtone.play();
  ringtone.stop();
  resolvePlayback();
  assert.equal(await playing, false);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.pauses, 2);
});

const { createCallNotifications } = await import(loadModuleUrl(new URL('../services/call-notifications.ts', import.meta.url)));
const incomingView = { ...incoming, participantId: incoming.callerId, incoming: true, selected: false, status: 'ringing', muted: false, cameraOff: false };
function mockNotifications(t, permission = 'granted', registration, onAnswer) {
  const originalWindow = globalThis.window;
  const originalNotification = globalThis.Notification;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const shown = [];
  const permissionRequests = [];
  function BrowserNotification(title, options) {
    const notification = { title, options, closed: false, close() { this.closed = true; } };
    shown.push(notification);
    return notification;
  }
  BrowserNotification.permission = permission;
  BrowserNotification.requestPermission = () => { permissionRequests.push(true); return Promise.resolve('granted'); };
  globalThis.Notification = BrowserNotification;
  globalThis.window = { Notification: BrowserNotification, focus() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { getRegistration: async () => registration } } });
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.Notification = originalNotification;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  });
  const notifications = createCallNotifications(onAnswer);
  t.after(() => notifications.dispose());
  return { notifications, shown, permissionRequests };
}
test('incoming notification is deduplicated and closes when accepted', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update(incomingView);
  notifications.update(incomingView);
  await flush();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'Llamada entrante');
  notifications.update({ ...incomingView, status: 'accepted' });
  assert.ok(shown[0].closed);
  notifications.update({ ...incomingView, status: 'ended' });
  await flush();
  assert.equal(shown.length, 1);
});
test('unanswered incoming call replaces ringing notice with one missed notification', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update(incomingView);
  await flush();
  notifications.update({ ...incomingView, status: 'missed' });
  notifications.update({ ...incomingView, status: 'missed' });
  await flush();
  assert.equal(shown.length, 2);
  assert.ok(shown[0].closed);
  assert.equal(shown[1].title, 'Llamada perdida');
  assert.notEqual(shown[0].options.tag, shown[1].options.tag);
});
test('missed state recovered by sync notifies without a preceding incoming event', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update({ ...incomingView, status: 'missed' });
  await flush();
  assert.equal(shown[0].title, 'Llamada perdida');
});
test('ended, rejected and outgoing calls do not invent a missed server state', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update(incomingView);
  notifications.update({ ...incomingView, status: 'ended' });
  notifications.update({ ...incomingView, callId: 'outgoing', incoming: false, status: 'missed' });
  notifications.update({ ...incomingView, callId: 'rejected' });
  notifications.update({ ...incomingView, callId: 'rejected', status: 'rejected' });
  await flush();
  assert.equal(shown.filter(item => item.title === 'Llamada perdida').length, 0);
});
test('permission is requested only by user action and can be granted during ringing', async t => {
  const { notifications, shown, permissionRequests } = mockNotifications(t, 'default');
  notifications.update(incomingView);
  await flush();
  assert.equal(shown.length, 0);
  assert.equal(permissionRequests.length, 0);
  Notification.permission = 'granted';
  notifications.update(incomingView);
  await flush();
  assert.equal(shown.length, 1);
});
test('unsupported notifications never interrupt the call observer', t => {
  const { notifications, shown } = mockNotifications(t);
  delete window.Notification;
  notifications.update(incomingView);
  notifications.update({ ...incomingView, status: 'missed' });
  assert.equal(shown.length, 0);
});
test('late service-worker notification is closed after the call was accepted', async t => {
  let resolveShow;
  const closed = [];
  const registration = {
    active: {},
    showNotification: () => new Promise(resolve => { resolveShow = resolve; }),
    getNotifications: async ({ tag }) => [{ close() { closed.push(tag); } }],
  };
  const { notifications, shown } = mockNotifications(t, 'granted', registration);
  notifications.update(incomingView);
  await flush();
  notifications.update({ ...incomingView, status: 'accepted' });
  resolveShow();
  await flush();
  assert.equal(shown.length, 0);
  assert.deepEqual(closed, [`messinger:call-incoming:${incomingView.callId}`]);
});
test('disposed call notifications close pending and already visible notices', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update(incomingView);
  await flush();
  notifications.update({ ...incomingView, status: 'missed' });
  notifications.dispose();
  await flush();
  assert.ok(shown.every(item => item.closed));
});

test('NO_ANSWER without a status still resolves to a missed incoming call', t => {
  const client = setup(t);
  events.get('CALL_INCOMING')(incoming);
  events.get('CALL_END')({ callId: incoming.callId, reason: 'NO_ANSWER' });
  assert.equal(client.getSnapshot().status, 'missed');
});

const answerCallId = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
function replyToNotificationSync(patch = {}) {
  const sync = sent.findLast(item => item.type === 'CALL_SYNC');
  const call = {
    callId: answerCallId, callerId: 'caller', calleeId: 'callee', role: 'CALLEE',
    media: 'video', status: 'ringing', isTerminal: false, isSelectedConnection: false,
    expiresAt: new Date(Date.now() + 30000).toISOString(), ...patch,
  };
  events.get('CALL_STATE')({ syncId: sync.data.syncId, call, negotiation: null });
}
test('cold-start notification click syncs before accepting and restores video metadata', t => {
  const client = setup(t);
  client.answerFromNotification(answerCallId);
  assert.deepEqual(sent.map(item => item.type), ['CALL_SYNC']);
  replyToNotificationSync();
  assert.deepEqual(sent.map(item => item.type), ['CALL_SYNC', 'CALL_ACCEPT']);
  assert.deepEqual(sent[1].data, { callId: answerCallId });
  assert.equal(client.getSnapshot().media, 'video');
  assert.equal(client.getSnapshot().participantId, 'caller');
  assert.equal(client.getSnapshot().selected, false);
});
test('notification clicks do not reaccept a call or apply late sync responses', t => {
  const client = setup(t);
  client.answerFromNotification(answerCallId);
  const staleSync = sent[0].data.syncId;
  client.answerFromNotification(answerCallId);
  replyToNotificationSync();
  replyToNotificationSync();
  client.answerFromNotification(answerCallId);
  assert.equal(sent.filter(item => item.type === 'CALL_ACCEPT').length, 1);
  assert.equal(sent[0].data.syncId, staleSync);
});
for (const patch of [
  { status: 'ended', isTerminal: true },
  { status: 'missed', isTerminal: true },
  { status: 'accepted', isSelectedConnection: false },
  { role: 'CALLER' },
  { expiresAt: new Date(0).toISOString() },
]) {
  test(`notification answer rejects unavailable server state ${JSON.stringify(patch)}`, t => {
    const client = setup(t);
    client.answerFromNotification(answerCallId);
    replyToNotificationSync(patch);
    assert.ok(!sent.some(item => item.type === 'CALL_ACCEPT'));
  });
}
test('an unrelated active call is never replaced by a notification click', t => {
  const client = setup(t);
  client.start('other', 'audio');
  client.answerFromNotification(answerCallId);
  assert.deepEqual(sent.map(item => item.type), ['CALL_INIT']);
});
test('notification answer retries sync while waiting for the selected WebSocket to be ready', t => {
  const client = setup(t);
  client.answerFromNotification(answerCallId);
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => originalNow() + 6000;
  tick();
  assert.equal(sent.filter(item => item.type === 'CALL_SYNC').length, 2);
  assert.notEqual(sent[0].data.syncId, sent[1].data.syncId);
  replyToNotificationSync();
  assert.equal(sent.filter(item => item.type === 'CALL_ACCEPT').length, 1);
});
test('canceling a pending notification answer prevents late snapshots from accepting', t => {
  const client = setup(t);
  client.answerFromNotification(answerCallId);
  client.end();
  replyToNotificationSync();
  assert.ok(!sent.some(item => item.type === 'CALL_ACCEPT'));
});
test('malformed notification identifiers are ignored before signaling', t => {
  const client = setup(t);
  client.answerFromNotification('not-a-uuid');
  assert.equal(sent.length, 0);
});

test('native fallback body clicks answer incoming calls but only open missed calls', async t => {
  const answered = [];
  const { notifications, shown } = mockNotifications(t, 'granted', undefined, id => answered.push(id));
  let focused = 0;
  window.focus = () => { focused++; };
  notifications.update(incomingView);
  await flush();
  assert.equal(shown[0].options.actions, undefined);
  shown[0].onclick({ preventDefault() {} });
  assert.equal(focused, 1);
  assert.deepEqual(answered, [incomingView.callId]);
  assert.ok(shown[0].closed);
  notifications.update({ ...incomingView, status: 'missed' });
  await flush();
  shown[1].onclick({ preventDefault() {} });
  assert.equal(focused, 2);
  assert.deepEqual(answered, [incomingView.callId]);
});
test('answer intent never creates a second incoming notification', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update({ ...incomingView, answering: true });
  await flush();
  assert.equal(shown.length, 0);
});
test('notification answer times out without late automatic acceptance', t => {
  const client = setup(t);
  client.answerFromNotification(answerCallId);
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => originalNow() + 16000;
  tick();
  replyToNotificationSync();
  assert.ok(!sent.some(item => item.type === 'CALL_ACCEPT'));
  assert.equal(client.getSnapshot().status, 'failed');
});

test('local service-worker notifications expose actions only for incoming calls', async t => {
  const shown = [];
  const registration = {
    active: {},
    showNotification: async (title, options) => shown.push({ title, options }),
    getNotifications: async () => [],
  };
  const { notifications } = mockNotifications(t, 'granted', registration);
  notifications.update(incomingView);
  await flush();
  assert.deepEqual(shown[0].options.actions, [
    { action: 'accept', title: 'Aceptar' },
    { action: 'reject', title: 'Rechazar' },
  ]);
  notifications.update({ ...incomingView, status: 'missed' });
  await flush();
  assert.equal(shown[1].options.actions, undefined);
});
test('notification rejection syncs before rejecting, without accepting or requesting media', t => {
  const client = setup(t);
  client.rejectFromNotification(answerCallId);
  client.rejectFromNotification(answerCallId);
  client.answerFromNotification(answerCallId);
  assert.deepEqual(sent.map(item => item.type), ['CALL_SYNC']);
  replyToNotificationSync();
  replyToNotificationSync();
  client.rejectFromNotification(answerCallId);
  assert.deepEqual(sent.map(item => item.type), ['CALL_SYNC', 'CALL_REJECT']);
  assert.deepEqual(sent[1].data, { callId: answerCallId });
  assert.equal(client.getSnapshot().status, 'rejected');
  assert.equal(client.getSnapshot().local, undefined);
});
for (const patch of [
  { status: 'ended', isTerminal: true },
  { status: 'missed', isTerminal: true },
  { status: 'accepted', isSelectedConnection: false },
  { role: 'CALLER' },
  { expiresAt: new Date(0).toISOString() },
]) {
  test(`notification rejection ignores unavailable state ${JSON.stringify(patch)}`, t => {
    const client = setup(t);
    client.rejectFromNotification(answerCallId);
    replyToNotificationSync(patch);
    assert.ok(!sent.some(item => item.type === 'CALL_REJECT' || item.type === 'CALL_ACCEPT'));
  });
}
test('notification rejection cannot replace an unrelated active call', t => {
  const client = setup(t);
  client.start('other', 'audio');
  client.rejectFromNotification(answerCallId);
  assert.deepEqual(sent.map(item => item.type), ['CALL_INIT']);
});

for (const media of ['audio', 'video']) {
  test(`outgoing ${media} calls ring until accepted and stop after cancellation or terminal states`, t => {
    const view = { media, incoming: false, status: 'requesting' };
    assert.equal(getCallSound(view), 'outgoing');
    assert.equal(getCallSound({ ...view, status: 'ringing' }), 'outgoing');
    for (const status of ['accepted', 'connected', 'rejected', 'missed', 'ended', 'failed']) {
      assert.equal(getCallSound({ ...view, status }), undefined);
    }
    assert.equal(getCallSound({ ...view, ending: true }), undefined);
    const audio = mockRingtone(t, async () => {});
    const ringtone = createCallRingtone('outgoing');
    assert.equal(audio.url, '/sounds/outgoing-call.wav');
    assert.equal(audio.loop, true);
    ringtone.stop();
    assert.equal(audio.currentTime, 0);
    assert.equal(audio.pauses, 1);
  });
}
test('incoming and outgoing tones cannot overlap during a notification answer', () => {
  assert.equal(getCallSound(null), undefined);
  assert.equal(getCallSound({ incoming: true, status: 'ringing' }), 'incoming');
  assert.equal(getCallSound({ incoming: true, status: 'requesting' }), undefined);
  assert.equal(getCallSound({ incoming: true, status: 'ringing', answering: true }), undefined);
});

test('camera action updates the actual video sender and preview without new signaling', async t => {
  const { client } = await selectedOffer(t, 'video');
  const previous = media.getVideoTracks()[0];
  const microphone = media.getTracks().find(track => track.kind === 'audio');
  let resolve;
  let captures = 0;
  navigator.mediaDevices.enumerateDevices = async () => ['front', 'back'].map(deviceId => ({ kind: 'videoinput', deviceId }));
  navigator.mediaDevices.getUserMedia = () => { captures++; return new Promise(done => { resolve = done; }); };
  const before = sent.length;
  client.toggle('video');
  const switching = client.switchCamera();
  await flush();
  assert.equal(client.getSnapshot().switchingCamera, true);
  await client.switchCamera();
  assert.equal(captures, 1);
  const replacement = { kind: 'video', enabled: true, readyState: 'live', stop() { this.stopped = true; } };
  resolve(new MediaStream([replacement]));
  await switching;
  assert.equal(client.getSnapshot().switchingCamera, false);
  assert.equal(client.getSnapshot().local.getVideoTracks()[0], replacement);
  assert.ok(previous.stopped);
  assert.equal(replacement.enabled, false);
  assert.equal(client.getSnapshot().cameraOff, true);
  assert.equal(peers[0].getSenders().find(sender => sender.track.kind === 'video').track, replacement);
  assert.equal(client.getSnapshot().local.getTracks().find(track => track.kind === 'audio'), microphone);
  assert.ok(!microphone.stopped);
  assert.equal(sent.length, before);
});

test('a camera permission failure is displayed without ending or renegotiating the call', async t => {
  const { client } = await selectedOffer(t, 'video');
  navigator.mediaDevices.enumerateDevices = async () => ['front', 'back'].map(deviceId => ({ kind: 'videoinput', deviceId }));
  navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  const before = sent.length;
  await client.switchCamera();
  assert.equal(client.getSnapshot().status, 'accepted');
  assert.equal(client.getSnapshot().switchingCamera, false);
  assert.match(client.getSnapshot().deviceError, /Permite el acceso/);
  assert.equal(sent.length, before);
  assert.equal(media.getVideoTracks()[0].readyState, 'live');
});

test('CALL_INIT includes the trimmed current client username', t => {
  const client = setup(t);
  client.start('callee', 'video', '  María Pérez  ');
  assert.equal(sent[0].data.callerName, 'María Pérez');
});

test('CALL_INCOMING keeps callerName across duplicate events', t => {
  const client = setup(t);
  events.get('CALL_INCOMING')({ ...incoming, callerName: 'María Pérez' });
  assert.equal(client.getSnapshot().participantName, 'María Pérez');
  events.get('CALL_INCOMING')({ ...incoming, callerName: undefined });
  assert.equal(client.getSnapshot().participantName, 'María Pérez');
  events.get('CALL_INCOMING')({ ...incoming, callerName: 'María actualizada' });
  assert.equal(client.getSnapshot().participantName, 'María actualizada');
});

test('incoming browser notification displays callerName without a conversations lookup', async t => {
  const { notifications, shown } = mockNotifications(t);
  notifications.update({ ...incomingView, participantName: 'María Pérez' });
  await flush();
  assert.equal(shown[0].title, 'María Pérez');
});

test('missed CALL_END supplies callerName for the web missed notification', async t => {
  const client = setup(t);
  events.get('CALL_INCOMING')(incoming);
  events.get('CALL_END')({ callId: incoming.callId, status: 'missed', reason: 'NO_ANSWER', callerName: 'María Pérez' });
  assert.equal(client.getSnapshot().participantName, 'María Pérez');
  const { notifications, shown } = mockNotifications(t);
  notifications.update(client.getSnapshot());
  await flush();
  assert.equal(shown[0].title, 'Llamada perdida de María Pérez');
});
