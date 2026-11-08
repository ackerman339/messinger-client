import type { CallServerPayloads } from '../types/call';
import type { CallLifecycle } from '../services/call-lifecycle';
import type { CallNegotiation } from '../services/call-negotiation';
import type { CallStore } from '../state/call-store';
export function createNegotiationEventHandlers(store: CallStore, lifecycle: CallLifecycle, negotiation: CallNegotiation) {

  function handleNegotiationCreated(data: CallServerPayloads['CALL_NEGOTIATION_CREATED']) {
    const session = store.match(data.callId);
    if (!session || !store.live(session) || !session.view.selected || data.requestId !== session.negotiationRequest || session.negotiation?.negotiationId === data.negotiationId) {
      return;
    }
    negotiation.setNegotiation(session, data);
    negotiation.enqueue(session, async () => {
      const peer = await negotiation.prepare(session);
      if (!store.live(session)) {
        return;
      }
      const offer = await peer.createOffer();
      if (!store.live(session)) {
        return;
      }
      await peer.setLocalDescription(offer);
      if (!store.live(session)) {
        return;
      }
      await negotiation.deliver(session, 'CALL_OFFER', peer.localDescription!.sdp);
    });
  }

  function handleOffer(data: CallServerPayloads['CALL_OFFER']) {
    const session = store.match(data.callId);
    if (!session || !store.live(session) || !session.view.selected || session.retired.has(data.negotiationId)) {
      return;
    }
    if (session.negotiation?.negotiationId !== data.negotiationId) {
      // A new remote reservation must be verified against server metadata before applying SDP.
      session.pendingOffer = data;
      lifecycle.sync(session);
      return;
    }
    negotiation.receive(session, 'CALL_OFFER', data);
  }

  function handleAnswer(data: CallServerPayloads['CALL_ANSWER']) {
    const session = store.match(data.callId);
    if (session && store.live(session) && session.negotiation?.negotiationId === data.negotiationId) {
      negotiation.receive(session, 'CALL_ANSWER', data);
    }
  }

  function handleSignalAck(data: CallServerPayloads['CALL_SIGNAL_ACK']) {
    const session = store.match(data.callId);
    if (session?.negotiation?.negotiationId === data.negotiationId) {
      session.delivery.acknowledge(data.signalType, data.signalId);
    }
  }

  function handleIceCandidate(data: CallServerPayloads['CALL_ICE_CANDIDATE']) {
    const session = store.match(data.callId);
    if (!session || !store.live(session) || !session.view.selected || session.retired.has(data.negotiationId)) {
      return;
    }
    if (!session.candidates.has(data.negotiationId) && session.candidates.size >= 4) {
      return;
    }
    const queue = session.candidates.get(data.negotiationId) ?? [];
    if (queue.length >= 256) {
      return;
    }
    queue.push(data.candidate);
    session.candidates.set(data.negotiationId, queue);
    negotiation.enqueue(session, () => negotiation.flushCandidates(session, data.negotiationId));
  }

  function handleNegotiationCompleted(data: CallServerPayloads['CALL_NEGOTIATION_COMPLETED']) {
    const session = store.match(data.callId);
    if (session?.negotiation?.negotiationId === data.negotiationId) {
      session.negotiation.status = data.status;
      session.delivery.clear();
    }
  }

  function handleNegotiationEnd(data: CallServerPayloads['CALL_NEGOTIATION_END']) {
    const session = store.match(data.callId);
    if (session?.negotiation?.negotiationId !== data.negotiationId) {
      return;
    }
    session.delivery.clear();
    session.negotiation!.status = data.status;
    store.publish(session, { notice: 'La negociación finalizó. Consultando el estado de la llamada.' });
    lifecycle.sync(session);
  }
  return { handleNegotiationCreated, handleOffer, handleAnswer, handleSignalAck, handleIceCandidate, handleNegotiationCompleted, handleNegotiationEnd };
}
