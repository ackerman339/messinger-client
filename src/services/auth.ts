import { httpClient } from '../clients/http-client';

import type { User } from '@/types/user';
import type { ApiResponse } from '@/types/services-response';

export interface SignInDto {
  loginKey: string;
}

export const authService = {
  signIn: async (data: SignInDto) => {
    const response = await httpClient.post<ApiResponse<User>>('/sign-in', data);
    return response.data.result;
  },

  me: async () => {
    const response = await httpClient.get<ApiResponse<User>>('/me');
    return response.data.result;
  },

  logout: () => httpClient.post('/logout'),
  refresh: () => httpClient.post('/refresh'),
};
