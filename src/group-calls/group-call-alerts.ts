import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCallSound } from '../hooks/use-call-sound';
import { createCallNotifications } from '../services/call-notifications';
import type { GroupCall, GroupCallAction } from './types';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function useGroupCallAlerts({
  incoming,
  outgoing,
  enabled,
  onAction,
}: {
  incoming: (GroupCall & { groupName: string }) | null;
  outgoing: boolean;
  enabled: boolean;
  onAction: (action: GroupCallAction) => void;
}) {
  useCallSound(incoming ? 'incoming' : outgoing ? 'outgoing' : undefined, incoming?.id);
  const [params, setParams] = useSearchParams();
  const actionHandler = useRef(onAction);
  useEffect(() => {
    actionHandler.current = onAction;
  }, [onAction]);
  const notifications = useRef<ReturnType<typeof createCallNotifications> | null>(null);

  useEffect(() => {
    return () => {
      notifications.current?.dispose();
      notifications.current = null;
    };
  }, []);

  useEffect(() => {
    const observer = (notifications.current ??= createCallNotifications((id, call) => {
      if (call.groupConversationId)
        actionHandler.current({
          id,
          action: 'accept',
          conversationId: call.groupConversationId,
          media: call.media,
          groupName: call.participantName,
        });
    }));
    observer.update(
      incoming
        ? {
            callId: incoming.id,
            groupConversationId: incoming.conversationId,
            incoming: true,
            participantName: incoming.groupName,
            status: 'ringing',
            media: incoming.media,
            expiresAt: incoming.ringingUntil,
          }
        : null,
    );
  }, [incoming, onAction]);

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    function receive(event: MessageEvent) {
      if (event.origin && event.origin !== window.location.origin) return;
      const { type, callId, conversationId, action, media, groupName } = event.data ?? {};
      if (
        type !== 'GROUP_CALL_NOTIFICATION_ACTION' ||
        typeof callId !== 'string' ||
        !uuid.test(callId) ||
        typeof conversationId !== 'string' ||
        !uuid.test(conversationId) ||
        (action !== 'accept' && action !== 'reject')
      )
        return;
      event.ports[0]?.postMessage({ type: 'CALL_NOTIFICATION_RECEIVED', callId, action });
      onAction({
        id: callId,
        conversationId,
        action,
        media: media === 'video' ? 'video' : 'audio',
        groupName,
      });
    }
    navigator.serviceWorker.addEventListener('message', receive);
    return () => navigator.serviceWorker.removeEventListener('message', receive);
  }, [enabled, onAction]);

  useEffect(() => {
    if (!enabled) return;
    const reject = params.get('rejectGroupCall');
    const accept = params.get('answerGroupCall');
    const id = reject ?? accept;
    const conversationId = params.get('groupCallConversation');
    if (!id || !conversationId || !uuid.test(id) || !uuid.test(conversationId)) return;
    const target: GroupCallAction = {
      id,
      conversationId,
      action: reject ? 'reject' : 'accept',
      media: params.get('groupCallMedia') === 'video' ? 'video' : 'audio',
    };
    const next = new URLSearchParams(params);
    for (const key of [
      'rejectGroupCall',
      'answerGroupCall',
      'groupCallConversation',
      'groupCallMedia',
    ]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
    queueMicrotask(() => onAction(target));
  }, [enabled, onAction, params, setParams]);
}
