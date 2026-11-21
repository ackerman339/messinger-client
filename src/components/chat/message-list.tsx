import { LocationContent } from './location-content';
import { mergeLocation } from '@/types/location';
import type { LocationState } from '@/types/location';
import {
  messageSync,
  pendingForConversation,
  getDeliveryStatus,
  mergeMessageHistory,
} from '@/services/message-sync';
import { MessageDeliveryIcon } from './message-delivery-icon';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoaderCircle } from 'lucide-react';
import { wsClient } from '@clients/websocket-client';
import { MessageStatus, WS_SERVER_EVENTS } from '@/types/websocket';
import { conversationService } from '@/services/conversation';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { useContactsContext } from '@/context/contacts-context';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';
import { MessageSelectionBar } from '@/components/chat/messages-selection-bar';
import { MessageAttachment } from '@/components/chat/attachments/message-attachment';
import { ConversationEventMessage } from '@/components/chat/conversation-event-message';

import type { Message, ConversationEvent } from '@/types/conversation';

export function MessageList() {
  const { user } = useUserContext();
  const { activeConversation, isLoadingAttachment, emptiedConversation } = useChatContext();
  const hasConversation = !!activeConversation;
  const conversationId = activeConversation?.id;

  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isDeletingMesssagesLoading, setIsDeleteMessagesLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Stores the scroll height before loading older messages.
   */
  const previousScrollHeightRef = useRef<number | null>(null);

  /**
   * Tracks whether the initial page is still being laid out.
   */
  const enableScrollToBottom = useRef(true);

  /**
   * Prevents the scroll compensation from running
   * when the initial page is loaded.
   */
  const isLoadingMoreRef = useRef(false);

  const {
    items: serverMessages,
    isLoading,
    hasMore,
    loadMore,
    setItems,
    refresh,
    reload,
  } = useCursorPagination<Message>({
    fetchPage: (cursor) => {
      if (!activeConversation) return Promise.resolve({ page: [], nextCursor: null });
      if (activeConversation.isDeleted || (!cursor && !messageSync.getSnapshot().connected)) {
        return Promise.resolve({
          page: [...(activeConversation.messages ?? [])].reverse(),
          nextCursor: null,
        });
      }
      return conversationService.getMessages(activeConversation.id, { cursor, limit: 20 });
    },
    mergePage: mergeMessageHistory,
    deps: [activeConversation?.id],
  });

  const { pending, connectionEpoch, updates, locations } = useSyncExternalStore(
    messageSync.subscribe,
    messageSync.getSnapshot,
    messageSync.getServerSnapshot,
  );
  const queued = useMemo(
    () => pendingForConversation(pending, activeConversation, user?.id),
    [pending, activeConversation, user?.id],
  );
  const items = useMemo(() => {
    const confirmed = new Set(serverMessages.map((message) => message.clientMessageId));
    return [
      ...serverMessages,
      ...queued.filter((message) => !confirmed.has(message.clientMessageId)),
    ];
  }, [serverMessages, queued]);
  const previousConnection = useRef(connectionEpoch);

  useEffect(() => {
    if (connectionEpoch === previousConnection.current) return;
    previousConnection.current = connectionEpoch;
    if (conversationId && !activeConversation?.isDeleted) reload();
  }, [activeConversation?.isDeleted, connectionEpoch, conversationId, reload]);

  useEffect(() => {
    if (activeConversation?.isDeleted) return;
    for (const message of serverMessages) messageSync.receipt(message, MessageStatus.DELIVERED);
  }, [activeConversation?.isDeleted, serverMessages]);

  /**
   * Load the next page of older messages.
   *
   * Save the current scroll height before loading so
   * the scroll position can be restored afterwards.
   */
  const handleLoadMore = useCallback(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    if (isLoadingMoreRef.current) {
      return;
    }

    if (!hasMore) {
      return;
    }

    if (isLoading) {
      return;
    }

    isLoadingMoreRef.current = true;

    previousScrollHeightRef.current = container.scrollHeight;

    loadMore();
  }, [hasMore, isLoading, loadMore]);

  /**
   * Scroll the container to the bottom.
   */
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (queued.length) scrollToBottom();
  }, [queued.length, scrollToBottom]);

  useLayoutEffect(() => {
    let live = true;
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      if (!live) return;
      if (activeConversation?.id !== (message.conversation?.id ?? message.conversationId)) {
        return;
      }

      enableScrollToBottom.current = true;
      setItems((prev) =>
        prev.some((item) => (item.messageId || item.id) === (message.messageId || message.id))
          ? prev
          : [...prev, message],
      );
    });

    const unsubscribeSentMessage = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      if (!live) return;
      if (activeConversation?.id !== (message.conversation?.id ?? message.conversationId)) {
        return;
      }

      enableScrollToBottom.current = true;
      setItems((prev) =>
        prev.some((item) => (item.messageId || item.id) === (message.messageId || message.id))
          ? prev
          : [...prev, message],
      );
    });

    function appendCallEvent({ conversationEvent }: { conversationEvent?: ConversationEvent }) {
      if (
        !live ||
        !conversationEvent ||
        conversationEvent.conversationId !== activeConversation?.id
      )
        return;
      enableScrollToBottom.current = true;
      setItems((current) =>
        current.some((item) => (item.messageId || item.id) === conversationEvent.id)
          ? current
          : [
              ...current,
              {
                ...conversationEvent,
                messageId: conversationEvent.id,
                senderId: conversationEvent.actorId,
                content: '',
                attachments: [],
                conversation: activeConversation!,
              },
            ],
      );
    }
    const offHistoryDeleted = wsClient.on('CALL_HISTORY_DELETED', ({ callId }) => {
      if (!live) return;
      setItems((current) =>
        current.filter(
          (item) =>
            (item.type !== 'CALL_ACCEPTED' && item.type !== 'CALL_END') ||
            (callId && item.metadata?.callId !== callId),
        ),
      );
    });
    const offEnd = wsClient.on('CALL_END', appendCallEvent);
    const offGroupStarted = wsClient.on('GROUP_CALL_STARTED', appendCallEvent);
    const offGroupEnded = wsClient.on('GROUP_CALL_ENDED', appendCallEvent);
    const offReject = wsClient.on('CALL_REJECT', appendCallEvent);

    return () => {
      live = false;
      unsubscribeNewMessage();
      unsubscribeSentMessage();
      offEnd();
      offGroupStarted();
      offGroupEnded();
      offHistoryDeleted();
      offReject();
    };
  }, [setItems, activeConversation]);

  const sentinelRef = useInfiniteScrollSentinel<HTMLDivElement>({
    onIntersect: handleLoadMore,
    enabled: hasMore,
    rootRef: containerRef,
    rootMargin: '10px',
  });

  /**
   * Reset the scroll state when the conversation changes.
   */
  useEffect(() => {
    enableScrollToBottom.current = true;
    isLoadingMoreRef.current = false;
    previousScrollHeightRef.current = null;

    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [activeConversation?.id]);

  /**
   * Preserve the user's visual scroll position after
   * older messages have been inserted at the top.
   */
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const previousScrollHeight = previousScrollHeightRef.current;

    if (previousScrollHeight === null) {
      return;
    }

    const newScrollHeight = container.scrollHeight;

    const heightDifference = newScrollHeight - previousScrollHeight;

    container.scrollTop += heightDifference;

    previousScrollHeightRef.current = null;
    isLoadingMoreRef.current = false;
  }, [items]);

  /**
   * Keep the scroll at the bottom while the initial
   * messages are still changing their height.
   *
   * This is useful when message attachments, audio,
   * fonts, or other content changes the layout after
   * the first render.
   */
  useLayoutEffect(() => {
    if (!enableScrollToBottom.current) {
      return;
    }

    if (items.length === 0) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scrollToBottom();
    });

    observer.observe(container);

    const frame = requestAnimationFrame(() => {
      scrollToBottom();
    });

    const timeout = window.setTimeout(() => {
      scrollToBottom();

      enableScrollToBottom.current = false;

      observer.disconnect();
    }, 150);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [items, scrollToBottom]);

  // Reset local state after the provider reports a successful explicit clear action.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!emptiedConversation || emptiedConversation.id !== activeConversation?.id) return;
    refresh();
    setSelectedMessageIds([]);
  }, [emptiedConversation, activeConversation?.id, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (activeConversation?.groupRevision && !activeConversation.isDeleted) refresh();
  }, [activeConversation?.groupRevision, activeConversation?.isDeleted, refresh]);

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((current) => {
      if (current.includes(messageId)) {
        return current.filter((id) => id !== messageId);
      }

      const message = items.find((item) => (item.messageId || item.id) === messageId);
      if (!message || message.localStatus) return current;
      if (message.senderId !== user?.id && (message.content === '' || message.attachments?.length))
        return current;
      if (current.length > 0) {
        const selectedAreOwn = current.every((id) =>
          items.some((item) => (item.messageId || item.id) === id && item.senderId === user?.id),
        );
        if (!user || message.senderId !== user.id || !selectedAreOwn) return current;
      }

      return [...current, messageId];
    });
  }

  function clearSelection() {
    setSelectedMessageIds([]);
  }

  const selectedMessages = items.filter((message) =>
    selectedMessageIds.includes(message.messageId || message.id),
  );
  const canDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every((message) => !!user && message.senderId === user.id);
  const selectedText =
    selectedMessageIds.length === 1 &&
    selectedMessages.length === 1 &&
    !selectedMessages[0].attachments?.length
      ? selectedMessages[0].content
      : '';

  async function copyMessages() {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText);
      clearSelection();
    } catch {
      window.alert('No se pudo copiar el texto. Inténtalo de nuevo.');
    }
  }

  async function deleteMessages() {
    if (!canDelete) return;
    setIsDeleteMessagesLoading(true);
    await conversationService.deleteMessages({
      conversationId: activeConversation!.id,
      messagesIds: selectedMessageIds,
    });

    selectedMessageIds.forEach((id) => messageSync.cancelLocationTracking(id));
    const newItems = serverMessages.filter(
      (message) => !selectedMessageIds.includes(message.messageId || message.id),
    );

    setItems(newItems);
    setIsDeleteMessagesLoading(false);
    setSelectedMessageIds([]);
  }

  return (
    <div
      ref={containerRef}
      className='chat-paper flex min-h-0 flex-1 flex-col gap-y-5 overflow-y-auto px-4 pb-5 lg:px-8'
    >
      <div ref={sentinelRef} className='h-1 min-h-1 shrink-0' />
      {hasConversation && items.length === 0 && !isLoading && (
        <EmptyState label='No hay mensajes todavía' />
      )}

      {selectedMessageIds.length > 0 && (
        <MessageSelectionBar
          count={selectedMessageIds.length}
          isLoading={isDeletingMesssagesLoading}
          canCopy={selectedText !== ''}
          canDelete={canDelete}
          onCopy={copyMessages}
          onDelete={deleteMessages}
          onClose={clearSelection}
        />
      )}

      {isLoadingAttachment && (
        <div className='h-12 w-full lg:w-[calc(100vw-400px-48px)] flex justify-center absolute z-10 right-0'>
          <div className='p-2 w-fit flex flex-col h-fit'>
            <LoaderCircle className='animate-spin self-center text-accent mb-2' />
            <span className='font-bold text-text-secondary/80 text-xs'>Subiendo</span>
          </div>
        </div>
      )}

      {items.map((message) => (
        <MessageBubble
          key={message.messageId || message.id}
          message={message}
          locationUpdate={locations?.get(message.messageId || message.id)}
          status={
            message.localStatus ??
            getDeliveryStatus(
              message.deliveries ?? [],
              updates.get(message.messageId || message.id),
            )
          }
          selected={selectedMessageIds.includes(message.messageId || message.id)}
          onSelect={toggleMessageSelection}
        />
      ))}
    </div>
  );
}

type MessageBubbleProps = {
  locationUpdate?: LocationState;
  status: React.ComponentProps<typeof MessageDeliveryIcon>['status'];
  message: Message;
  selected: boolean;
  onSelect: (messageId: string) => void;
};

function MessageBubble({ message, status, selected, onSelect, locationUpdate }: MessageBubbleProps) {
  const { user } = useUserContext();
  const { activeConversation, conversations } = useChatContext();
  const { contacts } = useContactsContext();

  const bubbleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bubble = bubbleRef.current;
    if (
      !bubble ||
      !user ||
      message.senderId === user.id ||
      message.localStatus ||
      activeConversation?.isDeleted
    )
      return;
    let visible = false;
    function markRead() {
      if (visible && document.visibilityState === 'visible' && document.hasFocus()) {
        messageSync.receipt(message, MessageStatus.READ);
      }
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRect.height > 0;
        markRead();
      },
      { threshold: 0.01 },
    );
    observer.observe(bubble);
    document.addEventListener('visibilitychange', markRead);
    window.addEventListener('focus', markRead);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', markRead);
      window.removeEventListener('focus', markRead);
    };
  }, [activeConversation?.isDeleted, message, user]);

  if (message.type && message.type !== 'MESSAGE') {
    return (
      <ConversationEventMessage
        message={message}
        members={[
          ...(activeConversation?.members ?? []),
          ...(activeConversation?.knownMembers ?? []),
          ...[...(conversations?.values() ?? [])].flatMap((conversation) => conversation.members),
        ]}
        isOwn={!!user && message.metadata?.callerId === user.id}
      />
    );
  }

  const isOwn = message.senderId === user?.id;
  const senderName =
    activeConversation?.type === 'GROUP'
      ? contacts.get(message.senderId)?.name?.trim() ||
        activeConversation.members
          .find((member) => member.userId === message.senderId)
          ?.username?.trim() ||
        activeConversation.knownMembers
          ?.find((member) => member.userId === message.senderId)
          ?.username?.trim() ||
        (isOwn ? user?.username?.trim() : undefined) ||
        'Miembro del grupo'
      : null;
  const messageId = message.messageId || message.id;
  const location = locationUpdate ? mergeLocation(message.location, locationUpdate) : message.location;

  function stopLocation() {
    if (messageSync.stopLocation(message)) return;
    window.alert('No se pudo guardar el cambio.');
  }


  function handleClick(event: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    event.stopPropagation();

    if (!message.localStatus) onSelect(messageId);
  }

  return (
    <article
      ref={bubbleRef}
      data-selector-id={messageId}
      onClick={handleClick}
      className={[
        'p-2',
        isOwn ? 'flex justify-end cursor-pointer' : 'flex justify-start cursor-pointer',
        selected ? 'ring-1 ring-accent/10 bg-accent/10' : '',
      ].join(' ')}
    >
      <div
        className={[
          'max-w-[min(76%,620px)] rounded-lg px-3 py-2 shadow-sm',
          isOwn ? 'rounded-br-sm bg-bg-bubble-own' : 'rounded-bl-sm bg-bg-bubble-other',
        ].join(' ')}
      >
        {senderName && (
          <p className='mb-1 truncate text-xs font-semibold text-accent'>{senderName}</p>
        )}
        {location ? (
          <LocationContent
            location={location}
            pending={message.localStatus === 'PENDING'}
            onStop={isOwn && !activeConversation?.isDeleted && message.localStatus !== 'FAILED' ? stopLocation : undefined}
          />
        ) : (
          <p className='whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-5'>
            {/^https?:\/\/\S+$/.test(message.content.trim()) ? (
              <a
                href={message.content.trim()}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary underline hover:opacity-80'
              >
                {message.content}
              </a>
            ) : (
              message.content
            )}
          </p>
        )}

        {message.attachments?.length > 0 && (
          <ul
            className='my-2 space-y-2'
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {message.attachments.map((attachment) => (
              <li key={attachment.id}>
                {message.localStatus ? (
                  attachment.fileName
                ) : (
                  <MessageAttachment attachment={attachment} />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className='mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-text-secondary'>
          <time>
            {format(new Date(message.createdAt), 'dd MMM hh:mm a', {
              locale: es,
            })}
          </time>

          {isOwn && <MessageDeliveryIcon status={status} />}
          {message.localStatus === 'FAILED' && (
            <button
              type='button'
              className='ml-1 underline'
              onClick={() => messageSync.discard(messageId)}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className='mx-auto my-auto rounded-lg bg-bg-app/85 px-4 py-2 text-sm text-text-secondary shadow-sm'>
      {label}
    </div>
  );
}
