import type { FileAttachment } from './file';

export type Member = {
  id: string;
  username: string;
  lastSeenAt: string | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  type: 'MESSAGE' | 'GROUP_CREATED' | 'MEMBER_JOINED';
  attachments: FileAttachment[];
};

export type Conversation = {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  name: string | null;
  members: Member[];
  messages: Message[];
  messagesCursor: string | null;
  createdAt: Date;
  updatedAt: Date;
};
