import { clearAttachmentAccount } from './attachment-storage';
import { offlineStorage } from './offline-storage';
import type { User } from '../types/user';

type ListName = 'conversations' | 'calls' | 'contacts';

const sessionKey = 'session';

export function offlineListKey(list: ListName, userId: string) {
  return `${list}:${userId}`;
}

export function readOfflineSession() {
  const session = offlineStorage.read<{ user: User | null }>(sessionKey);
  if (session?.user === null || typeof session?.user?.id === 'string') return session;
  return undefined;
}

export function saveOfflineUser({
  id,
  username,
  userCode,
  avatarUrl,
  role,
  status,
  createdAt,
  updatedAt,
}: User) {
  offlineStorage.write(sessionKey, {
    user: { id, username, userCode, avatarUrl, role, status, createdAt, updatedAt },
  });
}

export function clearOfflineSession(userId = readOfflineSession()?.user?.id) {
  offlineStorage.write(sessionKey, { user: null });
  if (!userId) return;
  clearAttachmentAccount(userId);
  for (const list of ['conversations', 'calls', 'contacts'] as const) {
    offlineStorage.remove(offlineListKey(list, userId));
  }
}

export function isSessionRejected(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403 || status === 404;
}
