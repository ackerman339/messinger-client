import { Avatar, ScrollArea } from 'radix-ui';
import { useChatContext } from '../../context/chat-context';
import { ChatMenu } from './chat-menu';
import type { Conversation } from '../../types/conversation';

export function ConversationList() {
  const { conversations, activeConversation, loadingConversations, handleCurrentConversation } =
    useChatContext();

  const conversationsItems = [...conversations.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <aside className='hidden min-h-0 border-r border-border bg-bg-sidebar md:grid md:grid-rows-[auto_1fr]'>
      <header className='border-b border-border px-4 py-3'>
        <div className='flex items-center gap-3'>
          <ChatMenu />
          <label className='flex h-10 flex-1 items-center rounded-full bg-slate-100 px-4 text-sm text-text-secondary'>
            <span className='sr-only'>Search conversations</span>
            <input
              className='w-full bg-transparent text-text-primary outline-none placeholder:text-text-secondary'
              placeholder='Search'
              type='search'
            />
          </label>
        </div>
      </header>

      <ScrollArea.Root className='min-h-0 overflow-hidden'>
        <ScrollArea.Viewport className='h-full'>
          <div className='p-2'>
            {loadingConversations ? <ListState label='Loading conversations...' /> : null}
            {!loadingConversations && conversations.size === 0 ? (
              <ListState label='No conversations yet' />
            ) : null}
            {conversationsItems.map((conversation) => (
              <ConversationRow
                conversation={conversation}
                isActive={conversation.id === activeConversation?.id}
                key={conversation.id}
                onSelect={() => handleCurrentConversation(conversation.id)}
              />
            ))}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          className='flex w-2 touch-none bg-transparent p-0.5'
          orientation='vertical'
        >
          <ScrollArea.Thumb className='flex-1 rounded-full bg-slate-300' />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

type ConversationRowProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
};

function ConversationRow({ conversation, isActive, onSelect }: ConversationRowProps) {
  const title = conversation?.name || conversation.members[0]?.user.username || '';

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
        <Avatar.Fallback>{title.slice(0, 2).toUpperCase()}</Avatar.Fallback>
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

      <span
        className={[
          'self-start pt-0.5 text-xs',
          isActive ? 'text-white/80' : 'text-text-secondary',
        ].join(' ')}
      >
        ---
        {/*  {conversation.timestamp} */}
      </span>
    </button>
  );
}

function ListState({ label }: { label: string }) {
  return <div className='px-4 py-8 text-center text-sm text-text-secondary'>{label}</div>;
}
