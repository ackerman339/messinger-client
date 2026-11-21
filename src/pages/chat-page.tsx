import { ContactsProvider } from '@/providers/contacts-provider';
import { GroupCallProvider } from '@/group-calls/group-call-provider';
import { GroupCallPanel } from '@/group-calls/group-call-panel';
import { CallPanel } from '@/calls/componentes/call-panel';
import { CallProvider } from '@providers/call-provider';
import { ChatProvider } from '@providers/chat-provider';
import { UserProvider } from '@providers/user-provider';
import { RequireAuth } from '@pages/route-guards';
import { ChatLayout } from '@components/chat/chat-layout';

export function ChatPage() {
  return (
    <UserProvider>
      <RequireAuth>
        <CallProvider>
          <ChatProvider>
            <GroupCallProvider>
              <ContactsProvider>
                <ChatLayout />
              </ContactsProvider>
              <CallPanel />
              <GroupCallPanel />
            </GroupCallProvider>
          </ChatProvider>
        </CallProvider>
      </RequireAuth>
    </UserProvider>
  );
}
