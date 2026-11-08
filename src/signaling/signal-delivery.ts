import { wsClient } from '@/clients/websocket-client';
type SignalType = 'CALL_OFFER' | 'CALL_ANSWER';
interface PendingSignal {
  type: SignalType;
  sdp: string;
  attempts: number;
  next: number;
}
const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 5;
/** Retries the original SDP; never generates or applies descriptions. */
export function createSignalDelivery() {
  const pending = new Map<string, PendingSignal>();

  function send(callId: string, negotiationId: string, type: SignalType, signalId: string, sdp: string) {
    pending.set(`${type}:${signalId}`, {
      type, sdp, attempts: 1, next: Date.now() + RETRY_DELAY_MS,
    });
    wsClient.emit(type, { callId, negotiationId, sdp });
  }

  function acknowledge(type: SignalType, signalId: string) {
    pending.delete(`${type}:${signalId}`);
  }

  function clear() {
    pending.clear();
  }

  function retry(callId: string, negotiationId: string, now: number, deadline?: string | null) {
    if (!pending.size) {
      return;
    }
    if (deadline && now >= Date.parse(deadline)) {
      clear();
      return 'expired';
    }
    for (const signal of pending.values()) {
      if (signal.next > now) {
        continue;
      }
      if (signal.attempts >= MAX_ATTEMPTS) {
        clear();
        return 'exhausted';
      }
      signal.attempts++;
      signal.next = now + RETRY_DELAY_MS;
      wsClient.emit(signal.type, { callId, negotiationId, sdp: signal.sdp });
    }
  }
  return { send, acknowledge, clear, retry, };
}
export type SignalDelivery = ReturnType<typeof createSignalDelivery>;
