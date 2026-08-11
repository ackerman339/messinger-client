import { httpClient } from '../clients/http-client';

import type { User } from '../types/user';
import type { ApiResponse } from '../types/services-response';
export interface GetUserByCodeDto {
  userCode: string;
}

type Response = Pick<User, 'id' | 'username'>;

export const userApi = {
  getUserByCode: (data: GetUserByCodeDto) =>
    httpClient.get<ApiResponse<Response>>('/user-code', { params: data }),
};
