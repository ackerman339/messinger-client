import { ChatProvider } from '@providers/chat-provider';
import { UserProvider } from '@providers/user-provider';
import { RequireAuth } from '@pages/route-guards';
import { ChatLayout } from '@components/chat/chat-layout';

export function ChatPage() {
  return (
    <UserProvider>
      <RequireAuth>
        <ChatProvider>
          <ChatLayout />
        </ChatProvider>
      </RequireAuth>
    </UserProvider>
  );
}
