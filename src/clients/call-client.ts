import { createCallStore } from '../state/call-store';
import { createCallLifecycle } from '../services/call-lifecycle';
import { createCallNegotiation } from '../services/call-negotiation';
import { createCallEventHandlers } from '../events/call-events';
import { createNegotiationEventHandlers } from '../events/negotiation-events';
import { subscribeCallEvents } from '../events/subscribe-call-events';

/** Composes the call flow and exposes only actions and observable state to React. */
export function createCallClient() {
  const store = createCallStore();
  const lifecycle = createCallLifecycle(store);
  const negotiation = createCallNegotiation(store, lifecycle);
  const callEvents = createCallEventHandlers(store, lifecycle, negotiation);
  const negotiationEvents = createNegotiationEventHandlers(store, lifecycle, negotiation);

  return {
    mount: () => subscribeCallEvents(store, lifecycle, callEvents, negotiationEvents),
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    start: lifecycle.start,
    accept: lifecycle.accept,
    end: lifecycle.end,
    toggle: lifecycle.toggle,
    dismiss: store.dismiss,
  };
}

export type CallClient = ReturnType<typeof createCallClient>;
