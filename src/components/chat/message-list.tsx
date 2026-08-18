import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { wsClient } from '@clients/websocket-client';
import { WS_SERVER_EVENTS } from '@/types/websocket';
import { fileService } from '@services/files';
import { conversationService } from '@/services/conversation';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';
import { MessageSelectionBar } from '@/components/chat/messages-selection-bar';

import type { Message } from '@/types/conversation';

export function MessageList() {
  const { activeConversation } = useChatContext();
  const hasConversation = !!activeConversation;

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

  const { items, isLoading, hasMore, loadMore, setItems } = useCursorPagination<Message>({
    fetchPage: (cursor) =>
      conversationService.getMessages(activeConversation!.id, {
        cursor,
        limit: 20,
      }),
    reverse: true,
    deps: [activeConversation?.id],
  });

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
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      enableScrollToBottom.current = true;

      setItems((prev) => [...prev, message]);
    });

    const unsubscribeSentMessage = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      enableScrollToBottom.current = true;
      setItems((prev) => [...prev, message]);
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeSentMessage();
    };
  }, [items, setItems, scrollToBottom]);

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

    const frame1 = requestAnimationFrame(() => {
      scrollToBottom();
    });

    const timeout = window.setTimeout(() => {
      scrollToBottom();

      enableScrollToBottom.current = false;

      observer.disconnect();
    }, 150);

    return () => {
      cancelAnimationFrame(frame1);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [items, scrollToBottom]);

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((current) => {
      if (current.includes(messageId)) {
        return current.filter((id) => id !== messageId);
      }

      return [...current, messageId];
    });
  }

  function clearSelection() {
    setSelectedMessageIds([]);
  }

  async function deleteMessages() {
    setIsDeleteMessagesLoading(true);
    await conversationService.deleteMessages({
      conversationId: activeConversation!.id,
      messagesIds: selectedMessageIds,
    });

    const newItems = items.filter(
      (message) => !selectedMessageIds.includes(message.messageId || message.id),
    );

    setItems(newItems);
    setIsDeleteMessagesLoading(false);
    setSelectedMessageIds([]);
  }

  return (
    <div
      ref={containerRef}
      className='chat-paper flex h-[calc(100vh-80px-64px)] max-h-[calc(100vh-80px-64px)] flex-col gap-y-5 overflow-y-auto px-4 pb-5 lg:px-8'
    >
      <div ref={sentinelRef} className='h-1 min-h-1 shrink-0' />

      {!hasConversation && <EmptyState label='Selecciona una conversación' />}

      {hasConversation && items.length === 0 && !isLoading && (
        <EmptyState label='No hay mensaje todavía' />
      )}

      {selectedMessageIds.length > 0 && (
        <MessageSelectionBar
          count={selectedMessageIds.length}
          isLoading={isDeletingMesssagesLoading}
          onDelete={deleteMessages}
          onClose={clearSelection}
        />
      )}

      {items.map((message) => (
        <MessageBubble
          key={message.messageId}
          message={message}
          selected={selectedMessageIds.includes(message.id || message.messageId)}
          onSelect={toggleMessageSelection}
        />
      ))}
    </div>
  );
}

type MessageBubbleProps = {
  message: Message;
  selected: boolean;
  onSelect: (messageId: string) => void;
};

function MessageBubble({ message, selected, onSelect }: MessageBubbleProps) {
  if (selected) {
    console.log('BUBBLE', message.messageId, selected);
  }

  const { user } = useUserContext();
  const [downloads, setDownloads] = useState<Map<string, string>>(new Map());

  const isOwn = message.senderId === user?.id;

  useEffect(() => {
    if (!message.attachments || message.attachments.length === 0) {
      return;
    }

    let cancelled = false;

    async function getDownloadUrls() {
      const downloads: {
        id: string;
        url: string;
      }[] = [];

      for (const attachment of message.attachments) {
        const result = await fileService.downloadFile({
          attachmentId: attachment.id,
        });

        if (cancelled) {
          return;
        }

        downloads.push({
          id: attachment.id,
          url: result.url,
        });
      }

      if (cancelled) {
        return;
      }

      setDownloads(new Map(downloads.map((download) => [download.id, download.url])));
    }

    getDownloadUrls();

    return () => {
      cancelled = true;
    };
  }, [message]);

  function handleClick() {
    if (!isOwn) {
      return;
    }

    onSelect(message.id || message.messageId);
  }

  return (
    <article className={isOwn ? 'flex justify-end cursor-pointer' : 'flex justify-start'}>
      <div
        onClick={handleClick}
        className={[
          'max-w-[min(76%,620px)] rounded-lg px-3 py-2 shadow-sm',
          isOwn ? 'rounded-br-sm bg-bg-bubble-own' : 'rounded-bl-sm bg-bg-bubble-other',
          selected ? 'ring-2 ring-accent' : '',
        ].join(' ')}
      >
        <p className='whitespace-pre-wrap wrap-break-word text-[15px] leading-5'>
          {message.content}
        </p>

        {message.attachments?.length > 0 && (
          <ul className='my-2 space-y-2'>
            {message.attachments.map((attachment) => {
              const url = downloads.get(attachment.id);

              if (!url) {
                return null;
              }

              if (attachment.contentType.startsWith('audio/')) {
                return (
                  <li key={attachment.id}>
                    <audio controls preload='auto' src={url} className='max-w-full' />
                  </li>
                );
              }

              return (
                <li key={attachment.id} className='text-accent'>
                  <a
                    href={url}
                    download={attachment.fileName}
                    className='hover:underline wrap-break-word'
                  >
                    {attachment.fileName}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <div className='mt-1 flex items-center justify-end gap-1 text-[11px] text-text-secondary'>
          <time>
            {format(new Date(message.createdAt), 'dd MMM HH:mm', {
              locale: es,
            })}
          </time>

          {isOwn ? <span className='text-accent'>✓✓</span> : null}
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
