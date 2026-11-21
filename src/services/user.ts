import { httpClient } from '@/clients/http-client';

import type { User } from '@/types/user';
import type { ApiResponse } from '@/types/services-response';

export interface GetUserByCodeDto {
  userCode: string;
}

export type Response = Pick<User, 'id' | 'username'>;

export const userService = {
  async updateUsername(username: string) {
    const response = await httpClient.patch<ApiResponse<User>>('/me', { username });
    return response.data.result;
  },

  async updateAvatar(data: File, contentType = data.type) {
    const response = await httpClient.put<ApiResponse<User>>('/me/avatar', data, {
      headers: { 'Content-Type': contentType },
    });
    return response.data.result;
  },

  async removeAvatar() {
    const response = await httpClient.delete<ApiResponse<User>>('/me/avatar');
    return response.data.result;
  },

  getUserByCode: (data: GetUserByCodeDto) =>
    httpClient.get<ApiResponse<Response>>('/user-code', { params: data }),
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
