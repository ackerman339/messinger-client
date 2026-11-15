import { wsClient } from '@/clients/websocket-client';
import { useEffect, useRef, useState } from 'react';
import { useCursorPagination } from './use-cursor-pagination';
import { callService } from '@/services/call';
import type { CallHistoryItem } from '@/types/call';

export function useCallHistory(userId?: string) {
  const history = useCursorPagination<CallHistoryItem>({
    fetchPage: (cursor) =>
      userId
        ? callService.getHistories({ cursor, limit: 20 })
        : Promise.resolve({ page: [], nextCursor: null }),
    deps: [userId],
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const deletingRef = useRef(false);

  const { setItems } = history;
  useEffect(
    () =>
      wsClient.on('CALL_HISTORY_DELETED', ({ callId }) => {
        setItems((items) =>
          callId ? items.filter((item) => item.id !== callId) : [],
        );
      }),
    [setItems],
  );

  async function remove(callId?: string) {
    if (history.isLoading || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(callId ?? 'all');
    setActionError('');
    try {
      if (callId) {
        await callService.deleteHistory(callId);
        history.setItems((items) => items.filter((item) => item.id !== callId));
      } else {
        await callService.deleteAllHistories();
        history.refresh();
      }
    } catch {
      setActionError('No se pudo eliminar el registro. Inténtalo de nuevo.');
    } finally {
      deletingRef.current = false;
      setDeleting(null);
    }
  }

  return { ...history, deleting, actionError, remove };
}
