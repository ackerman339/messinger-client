import { httpClient } from '../clients/http-client';

export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export const UserStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface SignUpDto {
  username: string;
  role?: UserRole; // defaults to UserRole.USER on the server
}

export interface SignInDto {
  loginKey: string;
}

export const authApi = {
  signUp: (data: SignUpDto) => httpClient.post('/sign-up', data),
  signIn: (data: SignInDto) => httpClient.post('/sign-in', data),
  logout: () => httpClient.post('/logout'),
  refresh: () => httpClient.post('/refresh'),
  me: () => httpClient.get('/me'),
};
