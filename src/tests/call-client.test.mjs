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
function mockMedia() {
  peers = [];
  class Stream {
    tracks = [];
    getTracks() { return this.tracks; }
    addTrack(track) { this.tracks.push(track); }
  }
  globalThis.MediaStream = Stream;
  globalThis.RTCPeerConnection = class {
    connectionState = 'new'; remoteDescription = null; localDescription = null; added = []; applied = 0; answers = 0;
    constructor() { peers.push(this); }
    addTrack() {}
    async setRemoteDescription(value) { this.applied++; this.remoteDescription = value; }
    async setLocalDescription(value) { this.localDescription = value; }
    async createAnswer() { this.answers++; return { type: 'answer', sdp: 'answer' }; }
    async addIceCandidate(value) { this.added.push(value); }
    close() { this.closed = true; }
  };
  const stream = new Stream(); stream.addTrack({ kind: 'audio', enabled: true, readyState: 'live', stop() { this.stopped = true; } });
  media = stream;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
}
async function selectedOffer(t) {
  mockMedia(); const client = setup(t);
  events.get('CALL_INCOMING')(incoming); events.get('CALL_ACCEPT')(accept);
  const signal = { ...offer, signalId: await sdpHash(offer.sdp) };
  events.get('CALL_OFFER')(signal);
  const sync = sent.findLast(item => item.type === 'CALL_SYNC');
  events.get('CALL_STATE')({ syncId: sync.data.syncId,
    call: { ...incoming, status: 'accepted', isSelectedConnection: true, isTerminal: false, currentNegotiationId: 'n1' },
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

const { createCallRingtone } = await import(loadModuleUrl(new URL('../services/call-ringtone.ts', import.meta.url)));
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
