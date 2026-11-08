import type { CallSession, CallView } from './call-session';

export function createCallStore() {
  let session: CallSession | undefined;
  let snapshot: CallView | null = null;
  const listeners = new Set<() => void>();
  const terminalIds = new Set<string>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function publish(current: CallSession, patch: Partial<CallView> = {}) {
    if (session !== current) {
      return;
    }
    current.view = { ...current.view, ...patch };
    snapshot = current.view;
    notify();
  }

  function live(current: CallSession) {
    return session === current && !current.closed && !current.cancelled;
  }

  function match(callId: string) {
    return session && !session.closed && session.view.callId === callId ? session : undefined;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dismiss() {
    if (!session?.closed) {
      return;
    }
    session = undefined;
    snapshot = null;
    notify();
  }
  return {
    getSession: () => session,
    setSession: (current: CallSession) => {
      session = current;
    },
    getSnapshot: () => snapshot,
    terminalIds,
    publish,
    live,
    match,
    subscribe,
    dismiss,
  };
}
export type CallStore = ReturnType<typeof createCallStore>;
