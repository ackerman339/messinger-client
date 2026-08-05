import { httpClient } from '../clients/http-client';
import type { UploadDto, DownloadDto } from '../types/file';

export const fileApi = {
  processUpload: (data: UploadDto) => httpClient.post('/upload', data),
  uploadFile: (file: File, url: string) =>
    httpClient.put(url, file, {
      withCredentials: false,
      headers: {
        'Content-Type': file.type,
      },
    }),
  downloadFile: (params: DownloadDto) => httpClient.get('/download', { params }),
};
