import { httpClient } from '@/clients/http-client';
import type { CallHistoryItem } from '@/types/call';
import type { ApiResponse, Pagination, PaginationParams } from '@/types/services-response';

export const callService = {
  getHistories: async (params: PaginationParams) => {
    const response = await httpClient.get<ApiResponse<Pagination<CallHistoryItem>>>(
      '/call/histories',
      { params },
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
