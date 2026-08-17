import type { Message } from './conversation';

export const WS_CLIENT_EVENTS = {
  SEND_PRIVATE_MESSAGE: 'SEND_PRIVATE_MESSAGE',
  SEND_GROUP_MESSAGE: 'SEND_GROUP_MESSAGE',
  MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
  MESSAGE_READ: 'MESSAGE_READ',
  GROUP_INVITE_MEMBER: 'GROUP_INVITE_MEMBER',
  GROUP_INVITATION_ACCEPT: 'GROUP_INVITATION_ACCEPT',
  GROUP_INVITATION_REJECT: 'GROUP_INVITATION_REJECT',
  TYPING_START: 'TYPING_START',
  TYPING_STOP: 'TYPING_STOP',
} as const;

export const WS_SERVER_EVENTS = {
  MESSAGE_SENT: 'MESSAGE_SENT',
  NEW_MESSAGE: 'NEW_MESSAGE',
  MESSAGE_STATUS_UPDATED: 'MESSAGE_STATUS_UPDATED',
  GROUP_INVITATION: 'GROUP_INVITATION',
  GROUP_MEMBER_JOINED: 'GROUP_MEMBER_JOINED',
  GROUP_MEMBER_LEFT: 'GROUP_MEMBER_LEFT',
  GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',
  GROUP_OWNER_CHANGED: 'GROUP_OWNER_CHANGED',
  GROUP_DELETED: 'GROUP_DELETED',
  PRESENCE_ONLINE: 'PRESENCE_ONLINE',
  PRESENCE_OFFLINE: 'PRESENCE_OFFLINE',
  TYPING_STARTED: 'TYPING_STARTED',
  TYPING_STOPPED: 'TYPING_STOPPED',
  ERROR: 'ERROR',
} as const;

export type WsErrorCode =
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
  // Fallback for non-BaseException errors (see note below)
  | 'UNHANDLED_WS_ERROR';

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
  content: string;
  attachments: MessageAttachmentDto[];
  receiverId: string;
}

export interface GroupMessageDto {
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

// --- Payloads del CLIENTE -> server ---
export interface WsClientPayloads {
  [WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE]: PrivateMessageDto;
  [WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE]: GroupMessageDto;
  [WS_CLIENT_EVENTS.MESSAGE_DELIVERED]: MessageDeliveryDto;
  [WS_CLIENT_EVENTS.MESSAGE_READ]: MessageDeliveryDto;
  [WS_CLIENT_EVENTS.GROUP_INVITE_MEMBER]: InviteGroupMemberDto;
  [WS_CLIENT_EVENTS.GROUP_INVITATION_ACCEPT]: GroupInvitationDto;
  [WS_CLIENT_EVENTS.GROUP_INVITATION_REJECT]: GroupInvitationDto;
  [WS_CLIENT_EVENTS.TYPING_START]: { conversationId: string };
  [WS_CLIENT_EVENTS.TYPING_STOP]: { conversationId: string };
}

// --- Data real que manda el SERVIDOR ---
export interface WsServerPayloads {
  [WS_SERVER_EVENTS.NEW_MESSAGE]: Message;
  [WS_SERVER_EVENTS.MESSAGE_SENT]: Message;
  [WS_SERVER_EVENTS.MESSAGE_STATUS_UPDATED]: {
    messageId: string;
    userId: string;
    status: MessageStatus;
  };
  [WS_SERVER_EVENTS.GROUP_INVITATION]: {
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
  [WS_SERVER_EVENTS.GROUP_DELETED]: {
    conversationId: string;
  };
  [WS_SERVER_EVENTS.PRESENCE_ONLINE]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.PRESENCE_OFFLINE]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.TYPING_STARTED]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.TYPING_STOPPED]: {
    userId: string;
  };
  [WS_SERVER_EVENTS.ERROR]: {
    success: false;
    error: {
      message: string;
      code: WsErrorCode;
    };
  };
}
