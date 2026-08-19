import { createContext, useContext } from 'react';

import type { Conversation } from '@/types/conversation';
import type { FileAttachment } from '@/types/file';
import type { User } from '@/types/user';
import type { Response } from '@/services/user';

export type ChatContextValue = {
  conversations: Map<string, Conversation>;
  activeConversation: Conversation | null;
  loadingConversations: boolean;
  error: string | null;
  receiverId: string;
  hasMoreConversations: boolean;
  isLoadingAttachment: boolean;
  handleSendMessage: (content: string, attachments: FileAttachment[]) => void;
  handleCurrentConversation: (conversationId: string) => void;
  prepareAttachments: (files: File[]) => Promise<FileAttachment[]>;
  getUserByCode: (userCode: string) => Promise<Response>;
  handleReceiverId: (id: string) => void;
  unSetCurrentConversation: () => void;
  loadMoreConversations: () => void;
  handleNewConversation: (conversation: Conversation) => void;
};

export const ChatContext = createContext<ChatContextValue>({
  conversations: new Map([]),
  activeConversation: null,
  loadingConversations: false,
  error: null,
  receiverId: '',
  hasMoreConversations: false,
  isLoadingAttachment: false,
  handleSendMessage: () => {},
  handleCurrentConversation: () => {},
  prepareAttachments: async () => [] as FileAttachment[],
  getUserByCode: async () => ({}) as User,
  handleReceiverId: () => {},
  unSetCurrentConversation: () => {},
  loadMoreConversations: () => {},
  handleNewConversation: () => {},
});

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useUser must be used within a <UserProvider>');
  return ctx;
}
