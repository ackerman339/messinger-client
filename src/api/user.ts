import { httpClient } from '../clients/http-client';

export interface GetUserByCodeDto {
  userCode: string;
}

export const userApi = {
  getUserByCode: (data: GetUserByCodeDto) => httpClient.get('/user-code', { params: data }),
};
