import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Avatar } from 'radix-ui';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { ChatMenu } from './chat-menu';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';
import { conversationService } from '@/services/conversation';
import { WS_SERVER_EVENTS } from '@/types/websocket';
import { wsClient } from '@clients/websocket-client';

import type { Conversation } from '@/types/conversation';

export function ConversationList() {
  const {
    conversations,
    activeConversation,
    loadingConversations,
    hasMoreConversations,
    handleCurrentConversation,
    loadMoreConversations,
    handleNewConversation,
  } = useChatContext();

  const viewportRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useInfiniteScrollSentinel<HTMLDivElement>({
    onIntersect: loadMoreConversations,
    enabled: hasMoreConversations && !loadingConversations,
    rootRef: viewportRef,
    rootMargin: '10px',
  });

  const conversationsItems = [...conversations.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  useLayoutEffect(() => {
    const unsubscribeNewConversationFrom = wsClient.on(
      WS_SERVER_EVENTS.NEW_MESSAGE,
      async (message) => {
        console.log(message.conversation);

        if (!conversations.has(message.conversation.id)) {
          handleNewConversation(message.conversation);
        }
      },
    );

    const unsubscribeNewConversationTo = wsClient.on(
      WS_SERVER_EVENTS.MESSAGE_SENT,
      async (message) => {
        console.log(message.conversation);

        if (!conversations.has(message.conversation.id)) {
          handleNewConversation(message.conversation);
        }
      },
    );

    return () => {
      unsubscribeNewConversationFrom();
      unsubscribeNewConversationTo();
    };
  }, [conversations, handleNewConversation]);

  async function handleSelect(conversationId: string) {
    handleCurrentConversation(conversationId);
    await conversationService.resetUnreadMessagesCount({ conversationId });
  }

  return (
    <aside className='min-h-full border-r border-border bg-bg-sidebar md:grid md:grid-rows-[auto_1fr]'>
      <header className='h-16 border-b border-border px-4 py-3'>
        <div className='flex items-center gap-3'>
          <ChatMenu />
          <label className='flex h-10 flex-1 items-center rounded-full bg-slate-100 px-4 text-sm text-text-secondary'>
            <span className='sr-only'>Buscar conversaciones</span>
            <input
              className='w-full bg-transparent text-text-primary outline-none placeholder:text-text-secondary'
              placeholder='Buscar conversaciones'
              type='search'
            />
          </label>
        </div>
      </header>

      <div className='h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-y-auto p-2'>
        {loadingConversations && <ListState label='Cargando conversaciones...' />}
        {!loadingConversations && conversations.size === 0 ? (
          <ListState label='No tienes conversaciones aún' />
        ) : (
          conversationsItems.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              isActive={conversation.id === activeConversation?.id}
              key={conversation.id}
              onSelect={() => handleSelect(conversation.id)}
            />
          ))
        )}
        <div ref={sentinelRef}></div>
      </div>
    </aside>
  );
}

type ConversationRowProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
};

function ConversationRow({ conversation, isActive, onSelect }: ConversationRowProps) {
  const { user } = useUserContext();
  const { activeConversation } = useChatContext();

  const privateConversationMember = conversation?.members.filter(
    (member) => member.userId !== user?.id,
  )[0];

  const privateConversationUser = conversation?.members.filter(
    (member) => member.userId === user?.id,
  )[0];

  const title =
    conversation.type === 'GROUP' ? conversation?.name : privateConversationMember.username;

  const [unreadMessageCount, setUnreadMessagesCount] = useState(
    privateConversationUser.unreadCount,
  );

  const [lastMessageContent, setLastMessageContent] = useState(conversation.lastMessage.content);

  useLayoutEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, async (message) => {
      if (activeConversation?.id === message.conversation.id) {
        setLastMessageContent(message.content);
        await conversationService.resetUnreadMessagesCount({
          conversationId: activeConversation.id,
        });
        return;
      }

      if (message.conversation.id === conversation.id) {
        setUnreadMessagesCount((prev) => prev + 1);
        setLastMessageContent(message.content);
      }
    });

    const unsubscribeMessageSent = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      if (message.conversation.id === conversation.id) {
        setLastMessageContent(message.content);
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeMessageSent();
    };
  }, [activeConversation?.id, conversation.id]);

  useEffect(() => {
    if (activeConversation?.id !== conversation.id) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnreadMessagesCount(0);
  }, [activeConversation?.id, conversation.id]);

  return (
    <button
      className={[
        'grid w-full grid-cols-[48px_1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition cursor-pointer',
        isActive ? 'bg-accent text-white' : 'hover:bg-slate-100',
      ].join(' ')}
      type='button'
      onClick={onSelect}
    >
      <Avatar.Root className='relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white'>
        <Avatar.Image className='size-full object-cover' src={undefined} alt='' />
        <Avatar.Fallback>{title ? title.slice(0, 2).toUpperCase() : ''}</Avatar.Fallback>
      </Avatar.Root>

      <span className='min-w-0'>
        <span className='truncate text-sm font-semibold'>{title}</span>
        {
          <span
            className={[
              'mt-0.5 block truncate text-sm',
              isActive
                ? 'text-white/80'
                : privateConversationUser.unreadCount > 0
                  ? 'text-accent'
                  : 'text-text-secondary',
            ].join(' ')}
          >
            {lastMessageContent}
          </span>
        }
      </span>

      {unreadMessageCount > 0 && (
        <div className='grid place-content-center size-7 rounded-full bg-accent'>
          <span className='text-[10px] text-white font-bold'>{unreadMessageCount}</span>
        </div>
      )}
    </button>
  );
}

function ListState({ label }: { label: string }) {
  return <div className='px-4 py-8 text-center text-sm text-text-secondary'>{label}</div>;
}
