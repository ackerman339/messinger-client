import { contactDisplayName } from '@/types/contact';
import { useContactsContext } from '@/context/contacts-context';
import { GroupCallButtons } from '@/group-calls/group-call-controls';
import { HeaderButton } from './header-button';
import { useLayoutEffect, useState } from 'react';
import { Avatar } from 'radix-ui';
import { ArrowLeft } from 'lucide-react';
import { CallButtons } from '@/calls/componentes/call-buttons';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import { formatLastSeen } from '@lib/utils';
import { WS_SERVER_EVENTS } from '@/types/websocket';
import { wsClient } from '@clients/websocket-client';

export function ChatHeader() {
  const { user } = useUserContext();
  const { contacts } = useContactsContext();
  const { activeConversation, unSetCurrentConversation } = useChatContext();
  const [presence, setPresence] = useState<{
    online: boolean;
    lastSeenAt: Date | null;
  }>({
    online: false,
    lastSeenAt: null,
  });

  const privateConversationMember =
    activeConversation?.type === 'PRIVATE'
      ? activeConversation.members.find((member) => member.userId !== user?.id)
      : undefined;
  const participantId = privateConversationMember?.userId;

  useLayoutEffect(() => {
    if (!participantId) return;

    const unsubscribeUserPresenceOnline = wsClient.on(
      WS_SERVER_EVENTS.PRESENCE_ONLINE,
      async (message) => {
        setPresence(message);
      },
    );

    const unsubscribeUserPresenceOffline = wsClient.on(
      WS_SERVER_EVENTS.PRESENCE_OFFLINE,
      async (message) => {
        setPresence(message);
      },
    );

    wsClient.emit('PRESENCE_ONLINE', { receiverId: participantId });

    return () => {
      unsubscribeUserPresenceOnline();
      unsubscribeUserPresenceOffline();
    };
  }, [participantId]);

  if (!activeConversation) {
    return null;
  }

  const contact = privateConversationMember && contacts.get(privateConversationMember.userId);
  const avatarUrl =
    privateConversationMember?.avatarUrl === undefined
      ? contact?.avatarUrl
      : privateConversationMember.avatarUrl;
  const title =
    activeConversation.type === 'GROUP'
      ? activeConversation?.name
      : contactDisplayName(contact, privateConversationMember?.username || 'Usuario Eliminado');

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
          <Avatar.Image className='size-full object-cover' src={avatarUrl ?? undefined} alt='' />
          <Avatar.Fallback>{title ? title.slice(0, 2).toUpperCase() : ''}</Avatar.Fallback>
        </Avatar.Root>
        <div className='min-w-0'>
          <h1 className='truncate text-base font-semibold'>{title}</h1>
          {activeConversation.type === 'PRIVATE' &&
            (presence.online ? (
              <p className='truncate text-xs text-text-secondary'>
                <span>En línea</span>
              </p>
            ) : (
              presence.lastSeenAt && (
                <p className='truncate text-xs text-text-secondary'>
                  <span>Ultima vez: </span>
                  {formatLastSeen(presence.lastSeenAt)}
                </p>
              )
            ))}
        </div>
      </div>

      <div className='flex items-center gap-1'>
        {activeConversation.type === 'PRIVATE' && privateConversationMember && (
          <CallButtons participantId={privateConversationMember.userId} />
        )}
        <GroupCallButtons />
        {!activeConversation.invitation && <HeaderButton key={activeConversation.id} />}
      </div>
    </header>
  );
}
