import { newMessageId } from '@/services/outbox-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatContext } from '@/context/chat-context';
import { useContactsContext } from '@/context/contacts-context';
import { useUserContext } from '@/context/user-context';
import {
  statusService,
  type Status,
  type StatusMedia,
  type StatusViewer,
} from '@/services/statuses';

export type StatusGroup = {
  authorId: string;
  name: string;
  avatarUrl: string | null;
  unseen: boolean;
  items: Status[];
};

export function useStatuses() {
  const { user, canSync } = useUserContext();
  const { prepareAttachments } = useChatContext();
  const { contacts } = useContactsContext();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [media, setMedia] = useState<{ id: string; source: StatusMedia }>();
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [mediaError, setMediaError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const publication = useRef<{ id: string; text: string; file?: File; uploadId?: string }>(null);

  const refresh = useCallback(async () => {
    if (!canSync) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const fetched = await statusService.list(controller.signal);
      const now = Date.now();
      const items = fetched.filter((item) => Date.parse(item.expiresAt) > now);
      if (controller.signal.aborted) return;
      setStatuses((current) => {
        const seen = new Set(current.filter((item) => item.seen).map((item) => item.id));
        return items.map((item) =>
          !item.seen && seen.has(item.id) ? { ...item, seen: true } : item,
        );
      });
      setError('');
    } catch {
      if (!controller.signal.aborted) setError('No se pudieron cargar los estados.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [canSync]);

  useEffect(() => {
    if (!canSync) return;
    const initial = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      request.current?.abort();
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [canSync, refresh]);

  useEffect(() => {
    if (!statuses.length) return;
    const expiresAt = Math.min(...statuses.map((item) => Date.parse(item.expiresAt)));
    const timer = setTimeout(
      () => {
        setStatuses((current) => current.filter((item) => Date.parse(item.expiresAt) > Date.now()));
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [statuses]);

  const groups = useMemo(() => {
    const authors = new Map<string, StatusGroup>();
    for (const status of statuses) {
      let group = authors.get(status.authorId);
      if (!group) {
        group = {
          authorId: status.authorId,
          name: contacts.get(status.authorId)?.name || status.username,
          avatarUrl: status.avatarUrl,
          unseen: false,
          items: [],
        };
        authors.set(status.authorId, group);
      }
      group.unseen ||= !status.seen;
      group.items.push(status);
    }
    for (const group of authors.values()) group.items.reverse();
    return [...authors.values()];
  }, [contacts, statuses]);
  const own = groups.find((group) => group.authorId === user?.id);
  const others = groups.filter((group) => group.authorId !== user?.id);
  const currentGroup = groups.find((group) => group.items.some((item) => item.id === selectedId));
  const current = currentGroup?.items.find((item) => item.id === selectedId);
  const currentId = current?.id;
  const hasMedia = !!current?.contentType;
  const isOwn = current?.authorId === user?.id;

  useEffect(() => {
    if (!currentId) return;
    const controller = new AbortController();
    const show = async () => {
      if (hasMedia) {
        try {
          const source = await statusService.getMedia(currentId, controller.signal);
          if (controller.signal.aborted) return;
          setMedia({ id: currentId, source });
        } catch {
          if (!controller.signal.aborted) setMediaError(currentId);
          return;
        }
      }
      if (isOwn) return;
      try {
        await statusService.markSeen(currentId, controller.signal);
        if (!controller.signal.aborted)
          setStatuses((current) =>
            current.map((item) =>
              item.id === currentId && !item.seen ? { ...item, seen: true } : item,
            ),
          );
      } catch {
        // A failed receipt does not interrupt media playback.
      }
    };
    void show();
    return () => controller.abort();
  }, [currentId, hasMedia, isOwn, mediaAttempt]);

  const step = useCallback(
    (offset: number) => {
      if (!currentGroup) return;
      const index = currentGroup.items.findIndex((item) => item.id === selectedId);
      const next = currentGroup.items[index + offset];
      if (!next && offset < 0) return;
      setSelectedId(next?.id ?? '');
      setMedia(undefined);
      setMediaError('');
    },
    [currentGroup, selectedId],
  );

  function open(group: StatusGroup) {
    setMutationError('');
    setMedia(undefined);
    setMediaError('');
    setSelectedId((group.items.find((item) => !item.seen) ?? group.items[0]).id);
  }

  async function publish(text: string, file?: File) {
    if (mutating.current || !canSync || (!file && !text.trim())) return false;
    mutating.current = true;
    setBusy(true);
    setMutationError('');
    try {
      const content = text.trim();
      const previous = publication.current;
      const draft =
        previous?.text === content && previous.file === file
          ? previous
          : { id: newMessageId(), text: content, file, uploadId: undefined };
      publication.current = draft;
      if (file && !draft.uploadId) draft.uploadId = (await prepareAttachments([file]))[0].id;
      await statusService.create(draft.id, draft.text, draft.uploadId);
      publication.current = null;
      await refresh();
      return true;
    } catch {
      setMutationError('No se pudo publicar el estado. Inténtalo de nuevo.');
      return false;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || !isOwn || mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setMutationError('');
    try {
      await statusService.remove(current.id);
      setStatuses((items) => items.filter((item) => item.id !== current.id));
      step(1);
      await refresh();
    } catch {
      setMutationError('No se pudo eliminar el estado.');
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  const retryMedia = useCallback(() => {
    setMedia(undefined);
    setMediaError('');
    setMediaAttempt((attempts) => attempts + 1);
  }, []);

  return {
    own,
    others,
    currentGroup,
    current,
    isOwn,
    media: media?.id === selectedId ? media.source : undefined,
    mediaError: mediaError === selectedId,
    retryMedia,
    loading: loading && !!canSync,
    online: !!canSync,
    error,
    mutationError,
    busy,
    refresh,
    publish,
    remove,
    open,
    step,
    close: () => setSelectedId(''),
  };
}

export function useStatusViewers(id: string | undefined) {
  const { contacts } = useContactsContext();
  const [result, setResult] = useState<{ id: string; viewers?: StatusViewer[] }>();

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void statusService
      .getViewers(id, controller.signal)
      .then((viewers) => {
        if (!controller.signal.aborted) setResult({ id, viewers });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ id });
      });
    return () => controller.abort();
  }, [id]);

  return {
    loading: result?.id !== id,
    error: result?.id === id && !result?.viewers,
    viewers: result?.id === id ? (result?.viewers ?? []) : [],
    name: (viewer: StatusViewer) => contacts.get(viewer.userId)?.name || viewer.username,
  };
}
