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
  uploadFile: async (file: File, url: string) => {
    const response = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
    if (!response.ok) throw new Error(`R2 upload failed: ${response.status}`);
  },

  processUpload: async (data: UploadDto) => {
    const response = await httpClient.post<ApiResponse<UploadResponse>>('/upload', data);

    return response.data.result;
  },

  prepareForward: async (attachmentIds: string[]) => {
    const { data } = await httpClient.post<ApiResponse<FileAttachment[]>>('/attachments/forward', { attachmentIds });
    return data.result;
  },

  downloadAudioBytes: async (attachmentId: string, signal: AbortSignal) => {
    const response = await httpClient.get<ArrayBuffer>('/download', {
      params: { attachmentId, format: 'audio-bytes' },
      responseType: 'arraybuffer',
      signal,
    });
    return response.data;
  },

  downloadFile: async (params: DownloadDto) => {
    const response = await httpClient.get<ApiResponse<DownloadResponse>>('/download', { params });

    return response.data.result;
  },
};
