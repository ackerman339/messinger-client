import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CallClient } from '@clients/call-client';

/** Delivers notification clicks to the existing client, or consumes a cold-start URL. */
export function useNotificationCallAction(client: CallClient) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(event: MessageEvent) {
      if (event.origin && event.origin !== window.location.origin) return;
      if (typeof event.data?.callId !== 'string') return;
      const action =
        event.data.type === 'CALL_NOTIFICATION_ANSWER'
          ? 'accept'
          : event.data.type === 'CALL_NOTIFICATION_ACTION'
            ? event.data.action
            : undefined;
      if (action === 'accept') client.answerFromNotification(event.data.callId);
      else if (action === 'reject') client.rejectFromNotification(event.data.callId);
      else return;
      event.ports[0]?.postMessage({
        type: 'CALL_NOTIFICATION_RECEIVED',
        callId: event.data.callId,
        action,
      });
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [client]);

  useEffect(() => {
    const rejectCallId = searchParams.get('rejectCall');
    const answerCallId = searchParams.get('answerCall');
    if (!rejectCallId && !answerCallId) return;
    if (rejectCallId) client.rejectFromNotification(rejectCallId);
    else if (answerCallId) client.answerFromNotification(answerCallId);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('answerCall');
        next.delete('rejectCall');
        return next;
      },
      { replace: true },
    );
  }, [client, searchParams, setSearchParams]);
}
