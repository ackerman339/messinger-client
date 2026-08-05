import type { FileAttachment } from './file';

export type Member = {
  userId: string;
  role: 'OWNER' | 'MEMBER';
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    status: string;
    lastSeenAt: string | null;
  };
};

export type Message = {
  id: string;
  conversationId: string;
  senderId?: string;
  actorId?: string;
  targetUserId?: string | null;
  createdAt: string;
  content?: string;
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
