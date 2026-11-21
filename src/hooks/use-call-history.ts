import { wsClient } from '@/clients/websocket-client';
import { useEffect, useRef, useState } from 'react';
import { useCachedList } from './use-cached-list';
import { offlineListKey } from '../services/offline-session';
import { callService } from '@/services/call';
import type { CallHistoryItem } from '@/types/call';

const callKey = (call: CallHistoryItem) => call.id;
const fetchCalls = (cursor: string | null, signal: AbortSignal) =>
  callService.getHistories({ cursor, limit: 20 }, signal);

export function useCallHistory(userId?: string, canSync = false) {
  const history = useCachedList<CallHistoryItem>({
    cacheKey: userId ? offlineListKey('calls', userId) : undefined,
    keyOf: callKey,
    fetchPage: fetchCalls,
  }, !!userId && canSync);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const deletingRef = useRef(false);

  const { setRecords, refresh } = history;
  useEffect(() => {
    if (!userId) return;
    return wsClient.on('CALL_HISTORY_DELETED', ({ callId }) => {
      setRecords((records) => {
        if (!callId) return new Map();
        const next = new Map(records);
        next.delete(callId);
        return next;
      });
      refresh();
    });
  }, [userId, setRecords, refresh]);

  async function remove(callId?: string) {
    if (history.loading || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(callId ?? 'all');
    setActionError('');
    try {
      if (callId) {
        await callService.deleteHistory(callId);
        setRecords((records) => {
          const next = new Map(records);
          next.delete(callId);
          return next;
        });
      } else {
        await callService.deleteAllHistories();
        setRecords(() => new Map());
        refresh();
      }
    } catch {
      setActionError('No se pudo eliminar el registro. Inténtalo de nuevo.');
    } finally {
      deletingRef.current = false;
      setDeleting(null);
    }
  }

  return {
    ...history,
    items: [...history.records.values()],
    isLoading: history.loading,
    deleting,
    actionError,
    remove,
  };
}
