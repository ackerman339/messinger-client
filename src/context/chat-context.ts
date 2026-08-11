import { createContext, useContext } from 'react';

import type { Conversation } from '@/types/conversation';
import type { FileAttachment } from '@/types/file';
import type { User } from '@/types/user';
import type { Response } from '@/services/user';

export type ChatContextValue = {
  conversations: Map<string, Conversation>;
  activeConversation: Conversation | null;
  typingUserIds: string[];
  loadingConversations: boolean;
  error: string | null;
  receiverId: string;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleSendMessage: (content: string, attachments: FileAttachment[]) => void;
  handleCurrentConversation: (conversationId: string) => void;
  prepareAttachments: (files: File[]) => Promise<FileAttachment[]>;
  getUserByCode: (userCode: string) => Promise<Response>;
  handleReceiverId: (id: string) => void;
  unSetCurrentConversation: () => void;
};

export const ChatContext = createContext<ChatContextValue>({
  conversations: new Map([]),
  activeConversation: null,
  typingUserIds: [],
  loadingConversations: false,
  error: null,
  receiverId: '',
  handleTypingStart: () => {},
  handleTypingStop: () => {},
  handleSendMessage: () => {},
  handleCurrentConversation: () => {},
  prepareAttachments: async () => [] as FileAttachment[],
  getUserByCode: async () => ({}) as User,
  handleReceiverId: () => {},
  unSetCurrentConversation: () => {},
});

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useUser must be used within a <UserProvider>');
  return ctx;
}
