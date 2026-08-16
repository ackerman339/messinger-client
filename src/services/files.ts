import { httpClient } from '@/clients/http-client';

import type { ApiResponse } from '@/types/services-response';
import type { UploadDto, DownloadDto, PresignedUrl, FileAttachment } from '../types/file';

type UploadResponse = {
  presignedUrls: PresignedUrl[];
  pendingUploads: FileAttachment[];
};

type DownloadResponse = {
  url: string;
};

export const fileService = {
  // R2 related service
  uploadFile: (file: File, url: string) =>
    fetch(url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    }),

  processUpload: async (data: UploadDto) => {
    const response = await httpClient.post<ApiResponse<UploadResponse>>('/upload', data);

    return response.data.result;
  },

  downloadFile: async (params: DownloadDto) => {
    const response = await httpClient.get<ApiResponse<DownloadResponse>>('/download', { params });

    return response.data.result;
  },
};
