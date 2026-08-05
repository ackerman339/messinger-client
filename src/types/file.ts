export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',

  'video/mp4',
  'video/webm',
  'video/quicktime',

  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',

  'application/pdf',

  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export type UploadFile = {
  contentType: UploadContentType;
  size: number;
  fileName: string;
};

export type UploadDto = {
  files: UploadFile[];
};

export type FileAttachment = {
  id: string;
  fileName: string;
  size: number;
  storageKey: string;
  contentType: string;
};

export type PresignedUrl = {
  key: string;
  url: string;
};

export type DownloadDto = {
  attachmentId: string;
};
