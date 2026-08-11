import { httpClient } from '../clients/http-client';

import type { ApiResponse } from '../types/services-response';
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
    httpClient.put(url, file, {
      withCredentials: false,
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
