import { httpClient } from '@/clients/http-client';

import type { Conversation } from '@/types/conversation';
import type { ApiResponse } from '@/types/services-response';
export interface CreateGroupDto {
  name: string;
  members: string[]; // user UUIDs
}

export interface LeaveGroupDto {
  conversationId: string;
}

export interface TransferOwnershipDto {
  conversationId: string;
  newOwnerId: string;
}

export interface RemoveMemberDto {
  conversationId: string;
  targetUserId: string;
}

export interface DeleteConversationDto {
  conversationId: string;
}

export interface GetConversationMessagesDto {
  conversationId: string;
  cursor?: string;
  limit?: number; // defaults to 30 on the server, max 50
}

export const conversationService = {
  getBootstrap: async () => {
    const response = await httpClient.get<ApiResponse<Conversation[]>>('/conversation-list');
    return response.data.result;
  },

  getMessages: (params: GetConversationMessagesDto) =>
    httpClient.get('/conversation/messages', { params }),

  // TODO: type responses
  createGroup: (data: CreateGroupDto) => httpClient.post('/conversation/create-group', data),

  leaveGroup: (data: LeaveGroupDto) => httpClient.post('/conversation/leave-group', data),

  transferOwnership: (data: TransferOwnershipDto) =>
    httpClient.post('/conversation/transfer-ownership', data),

  removeGroupMember: (data: RemoveMemberDto) =>
    httpClient.post('/conversation/remove-group-member', data),

  deleteGroup: (data: DeleteConversationDto) =>
    httpClient.delete('/conversation/delete-group', { data }),

  deletePrivateConversation: (data: DeleteConversationDto) =>
    httpClient.delete('/conversation/delete-private', { data }),
};
