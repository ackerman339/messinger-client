import type { LocationInput, LocationPoint, LocationUpdate } from './location';
import type { GroupCallNotice } from '../group-calls/types';
import type { Message } from './conversation';
import { CALL_CLIENT_EVENTS, CALL_SERVER_EVENTS } from './call';

import type { CallClientPayloads, CallServerPayloads } from './call';

export const WS_CLIENT_EVENTS = {
  WS_PING: 'WS_PING',
  SEND_PRIVATE_MESSAGE: 'SEND_PRIVATE_MESSAGE',
  SEND_GROUP_MESSAGE: 'SEND_GROUP_MESSAGE',
  MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
  MESSAGE_READ: 'MESSAGE_READ',
  LOCATION_UPDATE: 'LOCATION_UPDATE',
  LOCATION_STOP: 'LOCATION_STOP',
  GROUP_INVITE_MEMBER: 'GROUP_INVITE_MEMBER',
  GROUP_INVITATION_ACCEPT: 'GROUP_INVITATION_ACCEPT',
  GROUP_INVITATION_REJECT: 'GROUP_INVITATION_REJECT',
  TYPING_START: 'TYPING_START',
  TYPING_STOP: 'TYPING_STOP',
  PRESENCE_ONLINE: 'PRESENCE_ONLINE',
  ...CALL_CLIENT_EVENTS,
} as const;

export const WS_SERVER_EVENTS = {
  CALL_HISTORY_DELETED: 'CALL_HISTORY_DELETED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  WS_AUTHENTICATED: 'WS_AUTHENTICATED',
  WS_PONG: 'WS_PONG',
  MESSAGE_RECEIPT_CONFIRMED: 'MESSAGE_RECEIPT_CONFIRMED',
  NEW_MESSAGE: 'NEW_MESSAGE',
  MESSAGE_STATUS_UPDATED: 'MESSAGE_STATUS_UPDATED',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  LOCATION_STOP_CONFIRMED: 'LOCATION_STOP_CONFIRMED',
  GROUP_INVITATION_REJECTED: 'GROUP_INVITATION_REJECTED',
  GROUP_ACTION_CONFIRMED: 'GROUP_ACTION_CONFIRMED',
  GROUP_INVITATION: 'GROUP_INVITATION',
  GROUP_MEMBER_JOINED: 'GROUP_MEMBER_JOINED',
  GROUP_MEMBER_LEFT: 'GROUP_MEMBER_LEFT',
  GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',
  GROUP_OWNER_CHANGED: 'GROUP_OWNER_CHANGED',
  GROUP_DELETED: 'GROUP_DELETED',
  GROUP_CALL_STARTED: 'GROUP_CALL_STARTED',
  GROUP_CALL_ENDED: 'GROUP_CALL_ENDED',
  GROUP_CALL_RING_CLOSED: 'GROUP_CALL_RING_CLOSED',
  PRESENCE_ONLINE: 'PRESENCE_ONLINE',
  PRESENCE_OFFLINE: 'PRESENCE_OFFLINE',
  TYPING_STARTED: 'TYPING_STARTED',
  TYPING_STOPPED: 'TYPING_STOPPED',
  ERROR: 'ERROR',
  ...CALL_SERVER_EVENTS,
} as const;

export type WsErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  // Auth (thrown by authenticateWsConnection)
  | 'WS_AUTH:INVALID_ACCESS_TOKEN'
  | 'WS_AUTH:INVALID_SESSION'
  | 'WS_AUTH:SESSION_REVOKED'
  | 'WS_AUTH:EXPIRED_SESSION'
  // Conversations
  | 'CREATE_CONVERSATION:PRIVATE_CONVERSATION_REQUIRES_TWO_USERS'
  // Message delivery
  | 'COMFIRM_DELIVERY:DELIVERY_NOT_FOUND' // NOTE: typo in server code, kept as-is to match exactly
  // Group invitations
  | 'GROUP_INVITATION:CONVERSATION_NOT_FOUND'
  | 'GROUP_INVITATION:INVALID_CONVERSATION_TYPE'
  | 'GROUP_INVITATION:USER_IS_NOT_MEMBER'
  | 'GROUP_INVITATION:ONLY_OWNER_CAN_INVITE'
  | 'GROUP_INVITATION:CANNOT_INVITE_YOURSELF'
  | 'GROUP_INVITATION:USER_ALREADY_MEMBER'
  | `GROUP_INVITATION:${string}`
  | `GROUP:${string}`
  // Fallback for non-BaseException errors (see note below)
  | 'UNHANDLED_WS_ERROR'
  | `CALL_${string}`;

export const MessageStatus = {
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

// --- DTOs de entrada (cliente -> server) ---
export interface MessageAttachmentDto {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface PrivateMessageDto {
  replyToMessageId?: string;
  forwarded?: true;
  clientMessageId?: string;
  location?: LocationInput;
  content: string;
  attachments: MessageAttachmentDto[];
  receiverId: string;
}

export interface GroupMessageDto {
  replyToMessageId?: string;
  forwarded?: true;
  clientMessageId?: string;
  location?: LocationInput;
  content: string;
  attachments: MessageAttachmentDto[];
  conversationId: string;
}

export interface MessageDeliveryDto {
  conversationId: string;
  messageId: string;
  status: MessageStatus;
}

export interface InviteGroupMemberDto {
  conversationId: string;
  targetUserId: string;
}

export interface GroupInvitationDto {
  conversationId: string;
}

export interface UserPresenceOnlineDto {
  receiverId: string;
}

// --- Payloads del CLIENTE -> server ---
export interface WsClientPayloads extends CallClientPayloads {
  [WS_CLIENT_EVENTS.WS_PING]: null;
  [WS_CLIENT_EVENTS.LOCATION_UPDATE]: { messageId: string; point: LocationPoint };
  [WS_CLIENT_EVENTS.LOCATION_STOP]: { messageId: string };
  [WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE]: PrivateMessageDto;
  [WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE]: GroupMessageDto;
  [WS_CLIENT_EVENTS.MESSAGE_DELIVERED]: MessageDeliveryDto;
  [WS_CLIENT_EVENTS.MESSAGE_READ]: MessageDeliveryDto;
  [WS_CLIENT_EVENTS.GROUP_INVITE_MEMBER]: InviteGroupMemberDto;
  [WS_CLIENT_EVENTS.GROUP_INVITATION_ACCEPT]: GroupInvitationDto;
  [WS_CLIENT_EVENTS.GROUP_INVITATION_REJECT]: GroupInvitationDto;
  [WS_CLIENT_EVENTS.PRESENCE_ONLINE]: UserPresenceOnlineDto;
  [WS_CLIENT_EVENTS.TYPING_START]: { conversationId: string };
  [WS_CLIENT_EVENTS.TYPING_STOP]: { conversationId: string };
}

// --- Data real que manda el SERVIDOR ---
export interface WsServerPayloads extends CallServerPayloads {
  [WS_SERVER_EVENTS.WS_AUTHENTICATED]: { userId: string; connectionId?: string };
  [WS_SERVER_EVENTS.WS_PONG]: null;
  [WS_SERVER_EVENTS.LOCATION_UPDATED]: LocationUpdate;
  [WS_SERVER_EVENTS.LOCATION_STOP_CONFIRMED]: { messageId: string };
  [WS_SERVER_EVENTS.MESSAGE_RECEIPT_CONFIRMED]: MessageDeliveryDto;
  [WS_SERVER_EVENTS.NEW_MESSAGE]: Message;
  [WS_SERVER_EVENTS.MESSAGE_SENT]: Message;
  [WS_SERVER_EVENTS.MESSAGE_STATUS_UPDATED]: {
    conversationId: string;
    messageId: string;
    userId: string;
    status: MessageStatus;
  };
  [WS_SERVER_EVENTS.GROUP_INVITATION_REJECTED]: { conversationId: string };
  [WS_SERVER_EVENTS.GROUP_ACTION_CONFIRMED]: { event: string };
  [WS_SERVER_EVENTS.GROUP_INVITATION]: {
    invitationId?: string;
    conversationId: string;
    groupName: string;
    invitedBy: string;
  };
  [WS_SERVER_EVENTS.GROUP_MEMBER_JOINED]: {
    conversationId: string;
    userId: string;
  };
  [WS_SERVER_EVENTS.GROUP_MEMBER_LEFT]: {
    conversationId: string;
    userId: string;
  };
  [WS_SERVER_EVENTS.GROUP_MEMBER_REMOVED]: {
    conversationId: string;
    actorId: string;
    removedUserId: string;
  };
  [WS_SERVER_EVENTS.GROUP_OWNER_CHANGED]: {
    conversationId: string;
    previousOwnerId: string;
    newOwnerId: string;
  };
  [WS_SERVER_EVENTS.GROUP_CALL_STARTED]: GroupCallNotice;
  [WS_SERVER_EVENTS.GROUP_CALL_ENDED]: GroupCallNotice;
  [WS_SERVER_EVENTS.GROUP_CALL_RING_CLOSED]: { callId: string; conversationId: string };
  [WS_SERVER_EVENTS.GROUP_DELETED]: {
    conversationId: string;
  };
  [WS_SERVER_EVENTS.PRESENCE_ONLINE]: {
    online: boolean;
    lastSeenAt: Date | null;
  };
  [WS_SERVER_EVENTS.PRESENCE_OFFLINE]: {
    online: boolean;
    lastSeenAt: Date | null;
  };
  [WS_SERVER_EVENTS.TYPING_STARTED]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.TYPING_STOPPED]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.CALL_HISTORY_DELETED]: { callId?: string };
  [WS_SERVER_EVENTS.ERROR]: {
    success: false;
    error: {
      message: string;
      code: WsErrorCode;
    };
  };
}
