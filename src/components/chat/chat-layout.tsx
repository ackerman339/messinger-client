import { MessagesSquare } from 'lucide-react';
import { useMediaQuery } from 'react-responsive';
import { useChatContext } from '@context/chat-context';
import { ChatHeader } from './chat-header';
import { ConversationList } from './conversation-list';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

export function ChatLayout() {
  const { activeConversation } = useChatContext();
  const isDesktop = useMediaQuery({
    minWidth: 1024,
  });

  return (
    <main className='min-h-screen bg-bg-chat text-text-primary'>
      {/*Mobile layout*/}
      {!isDesktop && (
        <div className='h-screen lg:hidden'>
          <ConversationList />
          {activeConversation && (
            <section className='absolute z-50 w-full top-0 flex flex-col h-screen bg-bg-chat opacity-100 transition-opacity duration-300 starting:opacity-0'>
              <ChatHeader />
              <MessageList />
              <MessageComposer />
            </section>
          )}
        </div>
      )}
      <div className='hidden lg:grid h-screen grid-cols-1 overflow-hidden bg-bg-app md:grid-cols-[360px_1fr] lg:grid-cols-[400px_1fr]'>
        <ConversationList />
        {!activeConversation ? (
          <section className='chat-paper flex justify-center items-center flex-col'>
            <MessagesSquare size={100} className='mb-2 text-accent' />
            <p className='text-3xl text-text-secondary'>
              Selecciona una conversación o envia un mensaje
            </p>
          </section>
        ) : (
          <section className='flex flex-col h-screen bg-bg-chat opacity-100 transition-opacity duration-300 starting:opacity-0'>
            <ChatHeader />
            <MessageList />
            <MessageComposer />
          </section>
        )}
      </div>
    </main>
  );
}
