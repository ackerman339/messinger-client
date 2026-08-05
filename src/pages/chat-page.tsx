import { ChatLayout } from '../components/chat/chat-layout';
import { ChatProvider } from '../providers/chat-provider';

export function ChatPage() {
  return (
    <ChatProvider>
      <ChatLayout />
    </ChatProvider>
  );
}
