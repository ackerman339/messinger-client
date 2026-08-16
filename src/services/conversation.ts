import { httpClient } from '@/clients/http-client';

import type { Conversation, Message } from '@/types/conversation';
import type { ApiResponse, Pagination, PaginationParams } from '@/types/services-response';
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

export const conversationService = {
  getBootstrap: async (params: PaginationParams) => {
    const response = await httpClient.get<ApiResponse<Pagination<Conversation>>>(
      '/conversation-list',
      { params },
    );
    return response.data.result;
  },

  getMessages: async (conversationId: string, params: PaginationParams) => {
    const response = await httpClient.get<ApiResponse<Pagination<Message>>>(
      '/conversation/messages',
      { params: { ...params, conversationId } },
    );

    return response.data.result;
  },

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
