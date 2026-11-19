import type { CallMedia } from '../types/call';
import type { ConversationEvent } from '../types/conversation';

export type GroupCall = {
  id: string;
  conversationId: string;
  startedBy: string;
  media: CallMedia;
  createdAt: string;
  endedAt: string | null;
  ringingUntil?: string | null;
};

export type GroupCallTarget = Pick<GroupCall, 'id' | 'conversationId' | 'media'>;

export type GroupCallAction = GroupCallTarget & {
  action: 'accept' | 'reject';
  groupName?: string;
};

export type GroupCallAccess = {
  call: GroupCall;
  url: string;
  token: string;
  expiresIn: number;
  created?: boolean;
};

export type GroupCallNotice = {
  call: GroupCall;
  conversationEvent: ConversationEvent;
  groupName?: string;
};
