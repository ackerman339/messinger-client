import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pagination } from '@/types/services-response';

interface UseCursorPaginationParams<TResponse> {
  fetchPage: (cursor: string | null) => Promise<Pagination<TResponse>>;
  reverse?: boolean;
  getItemKey?: (item: TResponse) => string;
  deps?: unknown[];
}

export function useCursorPagination<TItem>({
  fetchPage,
  reverse = false,
  getItemKey,
  deps = [],
}: UseCursorPaginationParams<TItem>) {
  const [items, setItems] = useState<TItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPageRef = useRef(fetchPage);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const getItemKeyRef = useRef(getItemKey);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
    getItemKeyRef.current = getItemKey;
  }, [fetchPage, getItemKey]);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      if (loadingRef.current) {
        return;
      }

      loadingRef.current = true;

      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchPageRef.current(cursor);

        // Ignore stale responses.
        if (requestId !== requestIdRef.current) {
          return;
        }

        setItems((prev) => {
          const merged = reverse
            ? [...response.page, ...prev]
            : [...prev, ...response.page];
          const key = getItemKeyRef.current;
          return key
            ? [
                ...new Map(
                  merged.map((item) => [key(item), item]),
                ).values(),
              ]
            : merged;
        });

        const newCursor = response.nextCursor ?? null;

        setNextCursor(newCursor);
        setHasMore(newCursor !== null);
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setError(
          err instanceof Error ? err : new Error('Error al cargar datos'),
        );
      } finally {
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [reverse],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;

    // Clear the previous conversation before starting its replacement page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    setError(null);

    loadPage(null);

    // A late page from an old conversation must never update its replacement.
    return () => {
      requestIdRef.current += 1;
      loadingRef.current = false;
    };

    // Dependencies intentionally control pagination reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(() => {
    if (loadingRef.current) {
      return;
    }

    if (!hasMore) {
      return;
    }

    if (nextCursor === null) {
      return;
    }

    loadPage(nextCursor);
  }, [hasMore, nextCursor, loadPage]);

  const refresh = useCallback(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;

    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    setError(null);

    loadPage(null);
  }, [loadPage]);

  return {
    items,
    hasMore,
    error,
    isLoading,
    setItems,
    loadMore,
    refresh,
  };
}
