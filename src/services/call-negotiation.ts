import { sdpHash } from '../signaling/sdp-hash';
import type { Negotiation, SignalAck, CallServerPayloads } from '../types/call';
import type { CallLifecycle } from './call-lifecycle';
import type { CallStore } from '../state/call-store';
import type { CallSession as Session } from '../state/call-session';
import { wsClient } from '@/clients/websocket-client';

export function createCallNegotiation(store: CallStore, lifecycle: CallLifecycle) {
  function setNegotiation(session: Session, negotiation: Negotiation) {
    if (session.negotiation) {
      session.retired.add(session.negotiation.negotiationId);
      session.candidates.delete(session.negotiation.negotiationId);
    }
    session.negotiation = negotiation;
    session.delivery.clear();
  }

  function enqueue(session: Session, task: () => Promise<void>) {
    session.queue = session.queue
      .then(async () => {
        if (store.live(session)) {
          await task();
        }
      })
      .catch((error) => {
        if (store.live(session)) {
          lifecycle.fail(session, error);
        }
      });
  }

  function prepare(session: Session): Promise<RTCPeerConnection> {
    return session.rtc.prepare(session.view.media, {
      isActive: () => store.live(session),
      onCandidate: (candidate) => {
        if (!session.negotiation || !session.view.callId) {
          return;
        }
        wsClient.emit('CALL_ICE_CANDIDATE', {
          callId: session.view.callId,
          negotiationId: session.negotiation.negotiationId,
          candidate,
        });
      },
      onStreams: (local, remote) => store.publish(session, { local, remote }),
      onConnectionState: (state) => handlePeerState(session, state),
      onDeviceEnded: (kind) =>
        store.publish(session, {
          error: `El dispositivo de ${kind === 'audio' ? 'audio' : 'video'} dejó de estar disponible.`,
        }),
    });
  }

  function handlePeerState(session: Session, state: RTCPeerConnectionState) {
    if (state === 'connected') {
      if (!session.connectedReported) {
        session.connectedReported = true;
        wsClient.emit('CALL_CONNECTED', { callId: session.view.callId! });
      }
      store.publish(session, { notice: undefined });
    }
    if (state === 'failed') {
      store.publish(session, {
        notice: 'Falló la conexión de medios. Puedes finalizar y volver a llamar.',
      });
    }
    if (state === 'disconnected') {
      store.publish(session, { notice: 'Conexión de medios interrumpida…' });
    }
  }

  async function deliver(session: Session, type: 'CALL_OFFER' | 'CALL_ANSWER', sdp: string) {
    const negotiationId = session.negotiation!.negotiationId;
    const signalId = await sdpHash(sdp);
    if (!store.live(session) || session.negotiation?.negotiationId !== negotiationId) {
      return;
    }
    session.delivery.send(session.view.callId!, negotiationId, type, signalId, sdp);
  }

  function receive(
    session: Session,
    type: 'CALL_OFFER' | 'CALL_ANSWER',
    data: CallServerPayloads['CALL_ANSWER'],
  ) {
    enqueue(session, async () => {
      if (session.negotiation?.negotiationId !== data.negotiationId) {
        return;
      }
      if ((await sdpHash(data.sdp)) !== data.signalId) {
        throw new Error('La firma de la señal SDP no coincide.');
      }
      if (!store.live(session) || session.negotiation?.negotiationId !== data.negotiationId) {
        return;
      }
      const key = `${type}:${data.signalId}`;
      const ack: SignalAck = {
        callId: data.callId,
        negotiationId: data.negotiationId,
        signalType: type,
        signalId: data.signalId,
      };
      if (session.applied.has(key)) {
        wsClient.emit('CALL_SIGNAL_ACK', ack);
        return;
      }
      const peer = await prepare(session);
      if (!store.live(session) || session.negotiation?.negotiationId !== data.negotiationId) {
        return;
      }
      await peer.setRemoteDescription({
        type: type === 'CALL_OFFER' ? 'offer' : 'answer',
        sdp: data.sdp,
      });
      if (!store.live(session)) {
        return;
      }
      if (session.negotiation?.negotiationId !== data.negotiationId) {
        return;
      }
      session.remoteNegotiationId = data.negotiationId;
      session.applied.add(key);
      wsClient.emit('CALL_SIGNAL_ACK', ack);
      await flushCandidates(session, data.negotiationId);
      if (!store.live(session)) {
        return;
      }
      if (type === 'CALL_OFFER') {
        const answer = await peer.createAnswer();
        if (!store.live(session)) {
          return;
        }
        await peer.setLocalDescription(answer);
        if (!store.live(session)) {
          return;
        }
        await deliver(session, 'CALL_ANSWER', peer.localDescription!.sdp);
      }
    });
  }

  async function flushCandidates(session: Session, negotiationId: string) {
    if (
      session.negotiation?.negotiationId !== negotiationId ||
      session.remoteNegotiationId !== negotiationId ||
      !session.rtc.peer?.remoteDescription
    ) {
      return;
    }
    const peer = session.rtc.peer;
    const candidates = session.candidates.get(negotiationId) ?? [];
    while (candidates.length && store.live(session)) {
      const candidate = candidates.shift()!;
      // Discard stale ICE generations even when the negotiation ID was reused by a duplicate event.
      if (
        candidate?.usernameFragment &&
        !peer.remoteDescription!.sdp.includes(`a=ice-ufrag:${candidate.usernameFragment}`)
      ) {
        continue;
      }
      await peer.addIceCandidate(candidate ?? undefined);
    }
  }
  return { setNegotiation, enqueue, prepare, handlePeerState, deliver, receive, flushCandidates };
}
export type CallNegotiation = ReturnType<typeof createCallNegotiation>;
