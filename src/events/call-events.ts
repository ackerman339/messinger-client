import type { CallServerPayloads } from '../types/call';
import type { CallLifecycle } from '../services/call-lifecycle';
import type { CallNegotiation } from '../services/call-negotiation';
import { createCallSession } from '../state/call-session';
import { isTerminal } from '../types/call';
import type { CallStore } from '../state/call-store';
import { wsClient } from '@/clients/websocket-client';
export function createCallEventHandlers(store: CallStore, lifecycle: CallLifecycle, negotiation: CallNegotiation) {

  function handleCreated(data: CallServerPayloads['CALL_CREATED']) {
    const session = store.getSession();
    if (store.terminalIds.has(data.callId) || !session || session.closed || session.view.incoming || session.view.callId || data.calleeId !== session.view.participantId || (data.requestId && data.requestId !== session.requestId)) {
      return;
    }
    session.view.callId = data.callId;
    if (session.cancelled) {
      wsClient.emit('CALL_END', { callId: data.callId });
      lifecycle.finish(session);
      return;
    }
    store.publish(session, { callId: data.callId, status: data.status, expiresAt: data.expiresAt });
  }

  function handleIncoming(data: CallServerPayloads['CALL_INCOMING']) {
    if (store.terminalIds.has(data.callId)) {
      return;
    }
    const current = store.getSession();
    if (current && !current.closed) {
      return;
    }
    const session = createCallSession({ callId: data.callId, participantId: data.callerId, incoming: true,
      media: data.media, status: 'ringing', selected: false, expiresAt: data.expiresAt, muted: false, cameraOff: false });
    store.setSession(session);
    store.publish(session);
  }

  async function handleAccept(data: CallServerPayloads['CALL_ACCEPT']) {
    const session = store.match(data.callId);
    if (!session) {
      return;
    }
    if (session.cancelled) {
      wsClient.emit('CALL_END', { callId: data.callId });
      return;
    }
    store.publish(session, { status: data.status, selected: data.isSelectedConnection, expiresAt: data.connectionExpiresAt,
      notice: data.isSelectedConnection ? undefined : 'Llamada atendida en otro dispositivo' });
    session.deadline = data.connectionExpiresAt;
    if (!data.isSelectedConnection) {
      lifecycle.cleanup(session);
      return;
    }
    if (data.shouldInitiateNegotiation && !session.negotiationRequest && !session.negotiation) {
      session.negotiationRequest = crypto.randomUUID();
      wsClient.emit('CALL_NEGOTIATION_INIT', { callId: data.callId, requestId: session.negotiationRequest, type: 'INITIAL' });
    }
  }

  function handleReject(data: CallServerPayloads['CALL_REJECT']) {
    const session = store.match(data.callId);
    if (session) {
      lifecycle.finish(session, data.status);
    }
  }

  function handleEnd(data: CallServerPayloads['CALL_END']) {
    const session = store.match(data.callId);
    if (session) {
      lifecycle.finish(session, data.status ?? 'ended', data.reason);
    }
  }

  function handleConnected(data: CallServerPayloads['CALL_CONNECTED']) {
    const session = store.match(data.callId);
    if (!session) {
      return;
    }
    session.deadline = data.connectionExpiresAt;
    store.publish(session, { status: data.status, connectedAt: data.connectedAt, expiresAt: data.connectionExpiresAt });
  }

  function handleState(data: CallServerPayloads['CALL_STATE']) {
    const session = store.getSession();
    if (!session || session.closed || session.syncId !== data.syncId || (session.view.callId ? session.view.callId !== data.call.callId : session.requestId !== data.call.requestId)) {
      return;
    }
    const call = data.call;
    session.view.callId = call.callId;
    if (call.isTerminal || isTerminal(call.status)) {
      lifecycle.finish(session, call.status);
      return;
    }
    if (session.cancelled) {
      wsClient.emit('CALL_END', { callId: call.callId });
      return;
    }
    session.deadline = call.recoveryExpiresAt ?? call.connectionExpiresAt;
    store.publish(session, { status: call.status, selected: call.isSelectedConnection,
      connectedAt: call.connectedAt, expiresAt: call.expiresAt ?? session.deadline });
    if (!call.isSelectedConnection) {
      lifecycle.cleanup(session);
    }
    if (data.negotiation && call.isSelectedConnection) {
      if (session.negotiation?.negotiationId !== data.negotiation.negotiationId) {
        negotiation.setNegotiation(session, data.negotiation);
      }
      else {
        session.negotiation.status = data.negotiation.status;
      }
      if (data.negotiation.status === 'COMPLETED') {
        session.delivery.clear();
      }
      const offer = session.pendingOffer;
      session.pendingOffer = undefined;
      if (offer?.negotiationId === call.currentNegotiationId) {
        negotiation.receive(session, 'CALL_OFFER', offer);
      }
    }
  }
  return { handleCreated, handleIncoming, handleAccept, handleReject, handleEnd, handleConnected, handleState };
}
