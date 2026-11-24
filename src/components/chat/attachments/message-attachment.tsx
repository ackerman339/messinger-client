import { useEffect, useRef, useState } from 'react';
import { AudioAttachment } from './audio-attachment';
import { FileAttachment } from './file-attachment';
import { ImageAttachment } from './image-attachment';
import { VideoAttachment } from './video-attachment';

import type { Message } from '@/types/conversation';

type MessageAttachmentProps = {
  attachment: Message['attachments'][number];
};

const shortAudioLimit = 1024 * 1024;

export function MessageAttachment({ attachment }: MessageAttachmentProps) {
  const { id, fileName, contentType, size } = attachment;
  const props = { attachmentId: id, fileName, contentType };
  const isImage = contentType.startsWith('image/');
  const isAudio = contentType.startsWith('audio/');

  if (isImage || (isAudio && size <= shortAudioLimit)) {
    return (
      <VisibleAttachment>
        {(visible) => isImage
          ? <ImageAttachment {...props} visible={visible} />
          : <AudioAttachment {...props} autoLoad={visible} />}
      </VisibleAttachment>
    );
  }
  if (isAudio) return <AudioAttachment {...props} autoLoad={false} />;
  if (contentType.startsWith('video/')) return <VideoAttachment {...props} />;
  return <FileAttachment {...props} />;
}

function VisibleAttachment({ children }: { children: (visible: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (visible || !element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={ref}>{children(visible)}</div>;
}
