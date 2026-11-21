import { ContactsList } from './contacts-list';
import { CallHistoryList } from './call-history-list';
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Avatar, Tabs } from 'radix-ui';
import { ContactRound, MessagesSquare, Phone } from 'lucide-react';
import { useContactsContext } from '@/context/contacts-context';
import { contactDisplayName } from '@/types/contact';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { ChatMenu } from './chat-menu';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';
import { useConversationSearch } from '@/hooks/use-conversation-search';
import { conversationService } from '@/services/conversation';
import { wsClient } from '@clients/websocket-client';

import type {
  Conversation,
  Message,
  ConversationEvent,
} from '@/types/conversation';

export function ConversationList() {
  const [activeTab, setActiveTab] = useState('chats');
  const {
    conversations,
    activeConversation,
    loadingConversations,
    hasMoreConversations,
    handleCurrentConversation,
    loadMoreConversations,
    refreshConversations,
    error,
  } = useChatContext();
  const { query, setQuery, results: conversationsItems, isSearching } =
    useConversationSearch(conversations);

  const viewportRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useInfiniteScrollSentinel<HTMLDivElement>({
    onIntersect: loadMoreConversations,
    enabled:
      activeTab === 'chats' &&
      !isSearching &&
      hasMoreConversations &&
      !loadingConversations,
    rootRef: viewportRef,
    rootMargin: '10px',
  });

  const handleSelect = handleCurrentConversation;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <aside className='flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-bg-sidebar'>
        <header className='flex h-16 shrink-0 items-center gap-3 border-b border-border px-4'>
          <ChatMenu />
          <span className='text-lg font-semibold tracking-tight'>
            Pulse
          </span>
        </header>
        <Tabs.List
          aria-label='Chats, llamadas y contactos'
          className='grid shrink-0 grid-cols-3 border-b border-border px-3'
        >
          <Tabs.Trigger
            value='chats'
            className='flex items-center justify-center gap-2 border-b-2 border-transparent py-3 text-sm font-semibold text-text-secondary outline-none transition-colors hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent data-[state=active]:border-accent data-[state=active]:text-accent cursor-pointer'
          >
            <MessagesSquare size={18} aria-hidden='true' />
            Chats
          </Tabs.Trigger>
          <Tabs.Trigger
            value='calls'
            className='flex items-center justify-center gap-2 border-b-2 border-transparent py-3 text-sm font-semibold text-text-secondary outline-none transition-colors hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent data-[state=active]:border-accent data-[state=active]:text-accent cursor-pointer'
          >
            <Phone size={18} aria-hidden='true' />
            Llamadas
          </Tabs.Trigger>
          <Tabs.Trigger
            value='contacts'
            className='flex items-center justify-center gap-2 border-b-2 border-transparent py-3 text-sm font-semibold text-text-secondary outline-none transition-colors hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent data-[state=active]:border-accent data-[state=active]:text-accent cursor-pointer'
          >
            <ContactRound size={18} aria-hidden='true' />
            Contactos
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content
          value='chats'
          forceMount
          className='flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden'
        >
          <div className='shrink-0 px-4 py-3'>
            <label className='flex h-10 items-center rounded-full bg-slate-100 px-4 text-sm text-text-secondary'>
              <span className='sr-only'>Buscar conversaciones</span>
              <input
                className='w-full bg-transparent text-text-primary outline-none placeholder:text-text-secondary'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Buscar conversaciones'
                type='search'
              />
            </label>
          </div>
          <div
            ref={viewportRef}
            className='min-h-0 flex-1 overflow-y-auto p-2'
          >
            {error && (
              <div className='px-3 py-2 text-sm text-text-secondary'>
                <span role='alert'>{error}</span>
                <button type='button' onClick={refreshConversations} className='ml-2 cursor-pointer underline'>
                  Reintentar
                </button>
              </div>
            )}
            {!isSearching && loadingConversations && conversations.size === 0 && (
              <ListState label='Cargando conversaciones...' />
            )}
            {isSearching && conversationsItems.length === 0 ? (
              <ListState label='No se encontraron conversaciones' />
            ) : !loadingConversations && conversations.size === 0 ? (
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
            <div ref={sentinelRef} />
          </div>
        </Tabs.Content>
        <Tabs.Content
          value='calls'
          className='flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden'
        >
          <CallHistoryList />
        </Tabs.Content>
        <Tabs.Content
          value='contacts'
          className='flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden'
        >
          <ContactsList />
        </Tabs.Content>
      </aside>
    </Tabs.Root>
  );
}

function getLastMessageContent(
  message?: Pick<Message, 'type' | 'metadata' | 'location'> & { content?: string },
) {
  if (message?.location) return 'Ubicación';
  if (message?.type === 'CALL_ACCEPTED' || message?.type === 'CALL_END') {
    return message.metadata?.media === 'video'
      ? 'Videollamada'
      : 'Llamada de voz';
  }
  if (message?.type === 'GROUP_CALL_STARTED' || message?.type === 'GROUP_CALL_ENDED') {
    const type = message.metadata?.media === 'video' ? 'Videollamada grupal' : 'Llamada grupal';
    return message.type === 'GROUP_CALL_STARTED' ? type : `${type} finalizada`;
  }
  return message?.content ?? '';
}

type ConversationRowProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
};

function ConversationRow({
  conversation,
  isActive,
  onSelect,
}: ConversationRowProps) {
  const { user } = useUserContext();
  const { contacts } = useContactsContext();

  const privateConversationMember =
    conversation.type === 'PRIVATE'
      ? conversation.members.find((member) => member.userId !== user?.id)
      : undefined;

  const privateConversationUser = conversation?.members.filter(
    (member) => member.userId === user?.id,
  )[0];

  const contact = privateConversationMember && contacts.get(privateConversationMember.userId);
  const avatarUrl =
    privateConversationMember?.avatarUrl === undefined
      ? contact?.avatarUrl
      : privateConversationMember.avatarUrl;
  const title =
    conversation.type === 'GROUP'
      ? conversation.name
      : contactDisplayName(contact, privateConversationMember?.username || 'Usuario Eliminado');

  const unreadMessageCount = isActive ? 0 : (privateConversationUser?.unreadCount ?? 0);

  const lastEntryRef = useRef<
    Pick<Message, 'type' | 'metadata'> | undefined
  >(conversation.lastMessage);

  const [lastMessageContent, setLastMessageContent] = useState(
    getLastMessageContent(conversation.lastMessage),
  );

  useEffect(() => {
    lastEntryRef.current = conversation.lastMessage;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastMessageContent(getLastMessageContent(conversation.lastMessage));
  }, [conversation.lastMessage]);

  useLayoutEffect(() => {
    function handleCallEvent({
      conversationEvent,
    }: {
      conversationEvent?: ConversationEvent;
    }) {
      if (
        !conversationEvent ||
        conversationEvent.conversationId !== conversation.id
      )
        return;
      lastEntryRef.current = conversationEvent;
      setLastMessageContent(getLastMessageContent(conversationEvent));
    }
    const unsubscribeCallEnd = wsClient.on('CALL_END', handleCallEvent);
    const offGroupStarted = wsClient.on('GROUP_CALL_STARTED', handleCallEvent);
    const offGroupEnded = wsClient.on('GROUP_CALL_ENDED', handleCallEvent);
    const unsubscribeCallReject = wsClient.on(
      'CALL_REJECT',
      handleCallEvent,
    );

    const unsubscribeHistoryDeleted = wsClient.on(
      'CALL_HISTORY_DELETED',
      async ({ callId }) => {
        const entry = lastEntryRef.current;
        if (
          !entry ||
          (entry.type !== 'CALL_ACCEPTED' && entry.type !== 'CALL_END')
        )
          return;
        if (callId && entry.metadata?.callId !== callId) return;
        try {
          const result = await conversationService.getMessages(
            conversation.id,
            {
              cursor: null,
              limit: 1,
            },
          );
          if (lastEntryRef.current !== entry) return;
          lastEntryRef.current = result.page[0];
          setLastMessageContent(getLastMessageContent(result.page[0]));
        } catch {
          // The next bootstrap will refresh the preview if the connection is unavailable.
        }
      },
    );

    return () => {
      unsubscribeHistoryDeleted();
      unsubscribeCallEnd();
      offGroupStarted();
      offGroupEnded();
      unsubscribeCallReject();
    };
  }, [conversation.id]);

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
        <Avatar.Image
          className='size-full object-cover'
          src={avatarUrl ?? undefined}
          alt=''
        />
        <Avatar.Fallback>
          {title ? title.slice(0, 2).toUpperCase() : ''}
        </Avatar.Fallback>
      </Avatar.Root>

      <span className='min-w-0'>
        <span className='truncate text-sm font-semibold'>{title}</span>
        {
          <span
            className={[
              'mt-0.5 block truncate text-sm',
              isActive
                ? 'text-white/80'
                : unreadMessageCount > 0
                  ? 'text-accent'
                  : 'text-text-secondary',
            ].join(' ')}
          >
            {conversation.isDeleted
              ? 'Este grupo fue eliminado'
              : conversation.invitation
                ? 'Invitación pendiente'
                : lastMessageContent}
          </span>
        }
      </span>

      {unreadMessageCount > 0 && (
        <div className='grid place-content-center size-7 rounded-full bg-accent'>
          <span className='text-[0.625rem] text-white font-bold'>
            {unreadMessageCount}
          </span>
        </div>
      )}
    </button>
  );
}

function ListState({ label }: { label: string }) {
  return (
    <div className='px-4 py-8 text-center text-sm text-text-secondary'>
      {label}
    </div>
  );
}
