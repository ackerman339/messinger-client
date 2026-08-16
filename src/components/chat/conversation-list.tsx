import { useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar } from 'radix-ui';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { ChatMenu } from './chat-menu';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';

import type { Conversation } from '@/types/conversation';

export function ConversationList() {
  const {
    conversations,
    activeConversation,
    loadingConversations,
    hasMoreConversations,
    handleCurrentConversation,
    loadMoreConversations,
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
              onSelect={() => handleCurrentConversation(conversation.id)}
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

  const privateConversationMember = conversation?.members.filter(
    (member) => member.id !== user?.id,
  )[0];

  const title =
    conversation.type === 'GROUP' ? conversation?.name : privateConversationMember.username;

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
        {/*   {conversation.online ? (
          <span className='absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-online' />
        ) : null} */}
      </Avatar.Root>

      <span className='min-w-0'>
        <span className='truncate text-sm font-semibold'>{conversation.name}</span>
        {
          <span
            className={[
              'mt-0.5 block truncate text-sm',
              isActive ? 'text-white/80' : 'text-text-secondary',
            ].join(' ')}
          >
            {title}
          </span>
        }
      </span>

      <time
        className={[
          'self-start pt-0.5 text-xs',
          isActive ? 'text-white/80' : 'text-text-secondary',
        ].join(' ')}
      >
        {format(new Date(conversation.updatedAt), 'HH:mm a', {
          locale: es,
        })}
      </time>
    </button>
  );
}

function ListState({ label }: { label: string }) {
  return <div className='px-4 py-8 text-center text-sm text-text-secondary'>{label}</div>;
}
