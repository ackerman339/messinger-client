import { clearOfflineSession, saveOfflineUser } from './offline-session';
import { httpClient } from '../clients/http-client';

import type { User } from '@/types/user';
import type { ApiResponse } from '@/types/services-response';

export interface SignInDto {
  loginKey: string;
}

export const authService = {
  signIn: async (data: SignInDto) => {
    const response = await httpClient.post<ApiResponse<User>>('/sign-in', data);
    const user = response.data.result;
    saveOfflineUser(user);
    return user;
  },

  me: async (signal?: AbortSignal) => {
    const response = await httpClient.get<ApiResponse<User>>('/me', { signal, timeout: 5000 });
    return response.data.result;
  },

  logout: () => {
    clearOfflineSession();
    return httpClient.post('/logout');
  },
  refresh: () => httpClient.post('/refresh'),
};
