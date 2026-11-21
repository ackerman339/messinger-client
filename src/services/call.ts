import { httpClient } from '@/clients/http-client';
import type { CallHistoryItem } from '@/types/call';
import type { ApiResponse, Pagination, PaginationParams } from '@/types/services-response';

export const callService = {
  getHistories: async (params: PaginationParams, signal?: AbortSignal) => {
    const response = await httpClient.get<ApiResponse<Pagination<CallHistoryItem>>>(
      '/call/histories',
      { params, signal, timeout: 8000 },
    );
    return response.data.result;
  },

  deleteHistory: async (callId: string) => {
    await httpClient.delete(`/call/histories/${callId}`);
  },

  deleteAllHistories: async () => {
    await httpClient.delete('/call/histories');
  },
};
