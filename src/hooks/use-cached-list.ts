import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createCachedList } from '../services/cached-list';
import { messageSync } from '../services/message-sync';

type ListSettings<T> = Parameters<typeof createCachedList<T>>[0];

export function useCachedList<T>(
  { cacheKey, keyOf, fetchPage, isTransient, mergeItem }: ListSettings<T>,
  enabled: boolean
) {
  const store = useMemo(
    () =>
      createCachedList<T>({
        cacheKey,
        keyOf,
        fetchPage,
        isTransient,
        mergeItem,
      }),
    [cacheKey, keyOf, fetchPage, isTransient, mergeItem]
  );
  const epoch = useSyncExternalStore(
    messageSync.subscribe,
    () => messageSync.getSnapshot().connectionEpoch,
    () => 0
  );

  useEffect(() => {
    if (enabled) void store.refresh();
    return store.cancel;
  }, [enabled, epoch, store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const refresh = useCallback(() => {
    if (enabled) void store.refresh();
  }, [enabled, store]);
  const loadMore = useCallback(() => {
    if (enabled) void store.loadMore();
  }, [enabled, store]);

  return {
    ...snapshot,
    hasMore: enabled && snapshot.nextCursor !== null && !snapshot.error,
    refresh,
    loadMore,
    setRecords: store.update,
  };
}
