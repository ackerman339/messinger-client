import { httpClient } from '../clients/http-client';
import type { CallMedia } from '../types/call';
import type { GroupCall, GroupCallAccess, GroupCallTarget } from './types';

const options = { timeout: 12_000 };
const path = (conversationId: string) => `/conversation/${conversationId}/group-calls`;
const callPath = (call: Pick<GroupCall, 'conversationId' | 'id'>) =>
  `${path(call.conversationId)}/${call.id}`;

export const groupCallApi = {
  async getActive(conversationId: string, signal: AbortSignal) {
    const { data } = await httpClient.get<{ result: GroupCall | null }>(
      `${path(conversationId)}/active`,
      { ...options, signal },
    );
    return data.result;
  },
  async start(conversationId: string, media: CallMedia) {
    const { data } = await httpClient.post<{ result: GroupCallAccess }>(
      path(conversationId),
      { media },
      options,
    );
    return data.result;
  },
  async join(call: GroupCallTarget, fromNotification = false) {
    const { data } = await httpClient.post<{ result: GroupCallAccess }>(
      `${callPath(call)}/join`,
      { fromNotification },
      options,
    );
    return data.result;
  },
  async decline(call: Pick<GroupCall, 'conversationId' | 'id'>) {
    await httpClient.post(`${callPath(call)}/decline`, undefined, options);
  },
  async leave(call: Pick<GroupCall, 'conversationId' | 'id'>) {
    await httpClient.post(`${callPath(call)}/leave`, undefined, options);
  },
  async end(call: Pick<GroupCall, 'conversationId' | 'id'>) {
    await httpClient.delete(callPath(call), options);
  },
};
