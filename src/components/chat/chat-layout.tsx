import { MessagesSquare } from 'lucide-react';
import { useMediaQuery } from 'react-responsive';
import { useChatContext } from '@context/chat-context';
import { ChatHeader } from './chat-header';
import { ConversationList } from './conversation-list';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import { GroupInvitationPanel } from './group-invitation-panel';

export function ChatLayout() {
  const { activeConversation } = useChatContext();
  const isDesktop = useMediaQuery({
    minWidth: 1024,
  });

  return (
    <main className='relative min-h-screen bg-bg-chat text-text-primary'>
      <div
        className={
          isDesktop ? 'grid h-screen grid-cols-[400px_1fr] overflow-hidden bg-bg-app' : 'h-screen'
        }
      >
        <ConversationList />
        {activeConversation ? (
          <section
            key={activeConversation.id}
            className={`flex h-screen min-w-0 flex-col overflow-hidden bg-bg-chat opacity-100 transition-opacity duration-300 starting:opacity-0 ${isDesktop ? '' : 'absolute inset-x-0 top-0 z-50'}`}
          >
            <ChatHeader />
            {activeConversation.invitation ? (
              <GroupInvitationPanel key={activeConversation.id} />
            ) : (
              <>
                <MessageList key={activeConversation.id} />
                <MessageComposer key={activeConversation.id} />
              </>
            )}
          </section>
        ) : isDesktop ? (
          <section className='chat-paper flex flex-col items-center justify-center'>
            <MessagesSquare size={100} className='mb-2 text-accent' />
            <p className='text-3xl text-text-secondary'>
              Selecciona una conversación o envía un mensaje
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
