import { AudioAttachment } from './audio-attachment';
import { FileAttachment } from './file-attachment';
import { ImageAttachment } from './image-attachment';
import { VideoAttachment } from './video-attachment';

import type { Message } from '@/types/conversation';

type MessageAttachmentProps = {
  attachment: Message['attachments'][number];
};

export function MessageAttachment({ attachment }: MessageAttachmentProps) {
  const { id, fileName, contentType } = attachment;

  if (contentType.startsWith('image/')) {
    return <ImageAttachment attachmentId={id} fileName={fileName} />;
  }

  if (contentType.startsWith('video/')) {
    return <VideoAttachment attachmentId={id} fileName={fileName} />;
  }

  if (contentType.startsWith('audio/')) {
    return <AudioAttachment attachmentId={id} fileName={fileName} />;
  }

  return <FileAttachment attachmentId={id} fileName={fileName} contentType={contentType} />;
}
