import { Avatar, DropdownMenu } from 'radix-ui';
import { ArrowLeft, EllipsisVertical, MicSignal, BrushCleaning } from 'lucide-react';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { formatLastSeen } from '@lib/utils';
import { conversationService } from '@services/conversation';

export function ChatHeader() {
  const { user } = useUserContext();
  const { activeConversation, unSetCurrentConversation } = useChatContext();

  if (!activeConversation) {
    return null;
  }

  const privateConversationMember = activeConversation?.members.filter(
    (member) => member.userId !== user?.id,
  )[0];

  const title =
    activeConversation.type === 'GROUP'
      ? activeConversation?.name
      : privateConversationMember?.username || 'Usuario Eliminado';

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
          {activeConversation.type === 'PRIVATE' && privateConversationMember?.lastSeenAt && (
            <p className='truncate text-xs text-text-secondary'>
              <span>Ultima vez: </span>
              {formatLastSeen(privateConversationMember.lastSeenAt)}
            </p>
          )}
        </div>
      </div>

      <div className='flex items-center gap-1'>
        {/*  <HeaderButton label='Search' icon={<Search />} /> */}
        <HeaderButton />
      </div>
    </header>
  );
}

function HeaderButton() {
  const { user } = useUserContext();
  const { activeConversation, handleEmptyChat } = useChatContext();

  const privateConversationMember = activeConversation?.members.filter(
    (member) => member.userId !== user?.id,
  )[0];

  async function handleRequestConnection() {
    await conversationService.requestUserConnection({
      senderName: user!.username,
      conversationId: activeConversation!.id,
      targetUserId: privateConversationMember!.userId,
    });
  }

  async function handleEmptyMessages() {
    await conversationService.emptyMessages({ conversationId: activeConversation!.id });
    handleEmptyChat();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type='button'
          className='grid size-10 place-items-center rounded-full cursor-pointer text-text-secondary hover:bg-slate-100'
          aria-label='Menu'
        >
          <EllipsisVertical size={22} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align='start'
          sideOffset={8}
          className='z-50 min-w-52 rounded-lg border border-border bg-bg-app p-1 shadow-lg'
        >
          <DropdownMenu.Item
            className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
            onSelect={handleRequestConnection}
          >
            <MicSignal size={18} />
            <span>Solicitar que se conecte</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
            onSelect={handleEmptyMessages}
          >
            <BrushCleaning size={18} />
            <span>Vaciar chat</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
