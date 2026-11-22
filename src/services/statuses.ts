import { isAxiosError } from 'axios';
import { httpClient } from '@/clients/http-client';

export type Status = {
  id: string;
  authorId: string;
  username: string;
  avatarUrl: string | null;
  text: string;
  contentType: string | null;
  createdAt: string;
  expiresAt: string;
  seen: boolean;
  viewCount: number | null;
};

export type StatusMedia = { uri: string; requiresCredentials?: true };

export type StatusViewer = { userId: string; username: string; viewedAt: string };

function statusPath(id: string) {
  return `/statuses/${id}`;
}

export const statusService = {
  async list(signal?: AbortSignal) {
    const { data } = await httpClient.get<{ result: Status[] }>('/statuses', { signal });
    return data.result;
  },
  async create(id: string, text: string, uploadId?: string) {
    await httpClient.post('/statuses', { id, text, uploadId });
  },
  async getMedia(id: string, signal: AbortSignal): Promise<StatusMedia> {
    const path = statusPath(id);
    const request = () =>
      httpClient.get<{ result: { url: string; contentPath?: string } }>(`${path}/media`, {
        signal,
        timeout: 30_000,
      });
    const { data } = await request().catch((error: unknown) => {
      if (
        signal.aborted ||
        !isAxiosError(error) ||
        (error.response && ![408, 502, 503, 504].includes(error.response.status))
      )
        throw error;
      return request();
    });
    const contentPath = `${path}/media/content`;
    if (data.result.contentPath === contentPath) {
      return { uri: httpClient.getUri({ url: contentPath }), requiresCredentials: true };
    }
    return { uri: data.result.url };
  },
  async markSeen(id: string, signal: AbortSignal) {
    await httpClient.post(`${statusPath(id)}/view`, undefined, { signal });
  },
  async getViewers(id: string, signal: AbortSignal) {
    const { data } = await httpClient.get<{ result: StatusViewer[] }>(`${statusPath(id)}/viewers`, {
      signal,
    });
    return data.result;
  },
  async remove(id: string) {
    await httpClient.delete(statusPath(id));
  },
};

export const STATUS_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export function statusDuration(status: Status) {
  return Math.min(30_000, Math.max(7000, status.text.length * 44));
}
