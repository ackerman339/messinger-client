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

export interface User {
  id: string;
  username: string;
  userCode: string;
  avatarUrl: string | null;
  loginKey: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}
