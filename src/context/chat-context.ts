import type { LocationInput } from '../types/location';
import { createContext, useContext } from 'react';

import type { Conversation, Message, MessageReply } from '@/types/conversation';
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
  replyTarget: MessageReply | null;
  setReplyTarget: (message: Message | null) => void;
  emptiedConversation: Pick<Conversation, 'id'> | null;
  handleSendMessage: (
    content: string,
    attachments: FileAttachment[],
    location?: LocationInput,
  ) => boolean;
  handleCurrentConversation: (conversationId: string) => void;
  prepareAttachments: (files: File[]) => Promise<FileAttachment[]>;
  getUserByCode: (userCode: string) => Promise<Response>;
  handleReceiverId: (id: string) => void;
  unSetCurrentConversation: () => void;
  loadMoreConversations: () => void;
  refreshConversations: () => void;
  handleNewConversation: (conversation: Conversation) => void;
  handleEmptyChat: (conversationId: string) => void;
  handleRemoveConversation: (conversationId: string) => void;
  handleGroupDeleted: (conversationId: string) => void;
  handleGroupOwnerChanged: (
    conversationId: string,
    newOwnerId: string,
  ) => void;
};

export const ChatContext = createContext<ChatContextValue>({
  conversations: new Map([]),
  activeConversation: null,
  loadingConversations: false,
  error: null,
  receiverId: '',
  hasMoreConversations: false,
  isLoadingAttachment: false,
  emptiedConversation: null,
  replyTarget: null,
  setReplyTarget: () => {},
  handleSendMessage: () => false,
  handleCurrentConversation: () => {},
  prepareAttachments: async () => [] as FileAttachment[],
  getUserByCode: async () => ({}) as User,
  handleReceiverId: () => {},
  unSetCurrentConversation: () => {},
  loadMoreConversations: () => {},
  refreshConversations: () => {},
  handleNewConversation: () => {},
  handleEmptyChat: () => {},
  handleRemoveConversation: () => {},
  handleGroupDeleted: () => {},
  handleGroupOwnerChanged: () => {},
});

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx)
    throw new Error('useUser must be used within a <UserProvider>');
  return ctx;
}
