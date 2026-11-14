import type { FileAttachment } from "./file";

export type Member = {
  userId: string;
  username: string;
  lastSeenAt: string | null;
  unreadCount: number;
};

export type Message = {
  id: string;
  messageId: string;
  conversation: Conversation;
  senderId: string;
  content: string;
  createdAt: string;
  type:
    | "MESSAGE"
    | "GROUP_CREATED"
    | "MEMBER_JOINED"
    | "MEMBER_LEFT"
    | "MEMBER_REMOVED"
    | "OWNERSHIP_TRANSFERRED"
    | "CALL_ACCEPTED"
    | "CALL_END";
  attachments: FileAttachment[];
  conversationId?: string;
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  type: "PRIVATE" | "GROUP";
  name: string | null;
  members: Member[];
  messages: Message[];
  messagesCursor: string | null;
  lastMessage: Message | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type CallConversationEvent = Pick<
  Message,
  "id" | "createdAt" | "metadata"
> & {
  conversationId: string;
  type: "CALL_ACCEPTED" | "CALL_END";
  actorId: string;
  targetUserId: string | null;
};
