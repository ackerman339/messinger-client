import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar, Tooltip } from 'radix-ui';
import { MoreVertical, ArrowLeft } from 'lucide-react';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';

import type { ReactNode } from 'react';

export function ChatHeader() {
  const { user } = useUserContext();
  const { activeConversation, unSetCurrentConversation } = useChatContext();

  if (!activeConversation) {
    return null;
  }

  const privateConversationMember = activeConversation?.members.filter(
    (member) => member.id !== user?.id,
  )[0];

  const title =
    activeConversation.type === 'GROUP'
      ? activeConversation?.name
      : privateConversationMember.username;

  return (
    <header className='flex h-16 items-center justify-between border-b border-border bg-bg-app px-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <div className='block lg:hidden size-10 bg-none rounded-full'>
          <button
            type='button'
            className='h-full w-full grid place-items-center cursor-pointer'
            onClick={unSetCurrentConversation}
          >
            <ArrowLeft />
          </button>
        </div>
        <Avatar.Root className='grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white'>
          <Avatar.Image className='size-full object-cover' src={undefined} alt='' />
          <Avatar.Fallback>{title ? title.slice(0, 2).toUpperCase() : ''}</Avatar.Fallback>
        </Avatar.Root>
        <div className='min-w-0'>
          <h1 className='truncate text-base font-semibold'>{title}</h1>
          {activeConversation.type === 'PRIVATE' && privateConversationMember.lastSeenAt && (
            <p className='truncate text-xs text-text-secondary'>
              <span>Ultima vez: </span>
              {format(new Date(privateConversationMember.lastSeenAt!), "d 'de' MMMM yyyy HH:mm a", {
                locale: es,
              })}
            </p>
          )}
        </div>
      </div>

      <Tooltip.Provider delayDuration={150}>
        <div className='flex items-center gap-1'>
          {/*  <HeaderButton label='Search' icon={<Search />} /> */}
          <HeaderButton label='More options' icon={<MoreVertical />} />
        </div>
      </Tooltip.Provider>
    </header>
  );
}

type HeaderButtonProps = {
  label: string;
  icon: ReactNode;
};

function HeaderButton({ label, icon }: HeaderButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className='grid size-10 place-items-center rounded-full text-xl text-text-secondary transition hover:bg-slate-100 hover:text-text-primary'
          type='button'
          aria-label={label}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className='rounded bg-slate-900 px-2 py-1 text-xs text-white shadow'
          sideOffset={6}
        >
          {label}
          <Tooltip.Arrow className='fill-slate-900' />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
