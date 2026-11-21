import { offlineStorage } from './offline-storage';

type Page<T> = { page: T[]; nextCursor: string | null };
type Cache<T> = { items: T[]; nextCursor: string | null; pageCount: number };
type Settings<T> = {
  cacheKey?: string;
  keyOf: (item: T) => string;
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;
  isTransient?: (item: T) => boolean;
  mergeItem?: (server: T, current: T | undefined) => T;
};

export function createCachedList<T>(settings: Settings<T>) {
  const { cacheKey, keyOf, isTransient, mergeItem } = settings;
  const toMap = (items: T[]) => new Map(items.map((item) => [keyOf(item), item]));
  const cached = cacheKey ? offlineStorage.read<Cache<T>>(cacheKey) : undefined;
  let records = new Map<string, T>();
  try {
    if (Array.isArray(cached?.items)) records = toMap(cached.items);
  } catch {
    // Ignore an unreadable snapshot.
  }
  let snapshot = {
    records,
    nextCursor: typeof cached?.nextCursor === 'string' ? cached.nextCursor : null,
    pageCount: Number.isInteger(cached?.pageCount) ? Math.max(0, cached!.pageCount) : 0,
    ready: !!cached,
    loading: false,
    error: null as Error | null,
  };
  let request:
    | {
        controller: AbortController;
        changes: Map<string, T | undefined>;
      }
    | undefined;
  const listeners = new Set<() => void>();

  function publish(update: Partial<typeof snapshot>, persist = false) {
    snapshot = { ...snapshot, ...update };
    if (cacheKey && persist) {
      offlineStorage.write(cacheKey, {
        items: [...snapshot.records.values()].filter((item) => !isTransient?.(item)),
        nextCursor: snapshot.nextCursor,
        pageCount: snapshot.pageCount,
      });
    }
    for (const notify of listeners) notify();
  }

  function cancel() {
    request?.controller.abort();
    request = undefined;
    if (snapshot.loading) publish({ loading: false });
  }

  async function load(refresh: boolean) {
    if (!cacheKey || (!refresh && (request || !snapshot.nextCursor))) return;
    cancel();
    const current = {
      controller: new AbortController(),
      changes: new Map<string, T | undefined>(),
    };
    request = current;
    publish({ loading: true, error: null });

    let cursor = refresh ? null : snapshot.nextCursor;
    const limit = refresh ? Math.max(1, snapshot.pageCount) : 1;
    const received = new Map<string, T>();
    const cursors = new Set(cursor ? [cursor] : []);
    let pageCount = 0;
    try {
      do {
        const page = await settings.fetchPage(cursor, current.controller.signal);
        if (request !== current) return;
        for (const item of page.page) received.set(keyOf(item), item);
        cursor = page.nextCursor ?? null;
        if (cursor && cursors.has(cursor)) throw new Error('El cursor de la lista no avanzó.');
        if (cursor) cursors.add(cursor);
        pageCount++;
      } while (cursor && pageCount < limit);

      const next = refresh
        ? new Map([...snapshot.records].filter(([, item]) => isTransient?.(item)))
        : new Map(snapshot.records);
      for (const [id, item] of received) {
        if (refresh || !next.has(id)) {
          next.set(id, mergeItem ? mergeItem(item, snapshot.records.get(id)) : item);
        }
      }
      for (const [id, item] of current.changes) {
        if (item === undefined) next.delete(id);
        else next.set(id, item);
      }

      request = undefined;
      publish(
        {
          records: next,
          nextCursor: cursor,
          pageCount: refresh ? pageCount : snapshot.pageCount + pageCount,
          ready: true,
          loading: false,
        },
        true
      );
    } catch (error) {
      if (request !== current) return;
      request = undefined;
      publish({
        error: error instanceof Error ? error : new Error('No se pudo cargar la lista.'),
        loading: false,
      });
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(change: (previous: Map<string, T>) => Map<string, T>) {
      const previous = snapshot.records;
      const next = change(previous);
      if (next === previous) return;
      if (request) {
        for (const id of previous.keys()) if (!next.has(id)) request.changes.set(id, undefined);
        for (const [id, item] of next) {
          if (item !== previous.get(id)) request.changes.set(id, item);
        }
      }
      publish({ records: next }, true);
    },
    refresh: () => load(true),
    loadMore: () => load(false),
    cancel,
  };
}
