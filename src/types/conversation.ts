import type { FileAttachment } from './file';

export type Member = {
  userId: string;
  username: string;
  lastSeenAt: string | null;
  unreadCount: number;
  role?: 'OWNER' | 'MEMBER';
  softDeletedAt?: string | null;
};

export type Message = {
  id: string;
  messageId: string;
  conversation: Conversation;
  senderId: string;
  content: string;
  createdAt: string;
  type:
    | 'MESSAGE'
    | 'GROUP_CREATED'
    | 'MEMBER_JOINED'
    | 'MEMBER_LEFT'
    | 'MEMBER_REMOVED'
    | 'OWNERSHIP_TRANSFERRED'
    | 'CALL_ACCEPTED'
    | 'CALL_END'
    | 'GROUP_CALL_STARTED'
    | 'GROUP_CALL_ENDED';
  attachments: FileAttachment[];
  conversationId?: string;
  actorId?: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  name: string | null;
  invitation?: { invitationId?: string; invitedBy: string };
  members: Member[];
  knownMembers?: Member[];
  isDeleted?: boolean;
  groupRevision?: number;
  messages: Message[];
  messagesCursor: string | null;
  lastMessage: Message | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationEvent = Pick<Message, 'id' | 'createdAt' | 'metadata'> & {
  conversationId: string;
  type: 'CALL_ACCEPTED' | 'CALL_END' | 'GROUP_CALL_STARTED' | 'GROUP_CALL_ENDED';
  actorId: string;
  targetUserId: string | null;
};

export type CallConversationEvent = ConversationEvent & {
  type: 'CALL_ACCEPTED' | 'CALL_END';
};
