import { useRef, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from 'radix-ui';
import { fileService } from '@services/files';
import { useUserContext } from '@context/user-context';
import { useChatContext } from '@context/chat-context';
import type { Message } from '@/types/conversation';

export function MessageList() {
  const { activeConversation } = useChatContext();

  const loading = false;
  const error = null;
  const hasConversation = !activeConversation;

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages: Message[] = useMemo(
    () => activeConversation?.messages || [],
    [activeConversation],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'end',
    });
  });

  return (
    <ScrollArea.Root className='chat-paper min-h-0'>
      <ScrollArea.Viewport className='h-full'>
        <div className='mx-auto flex min-h-full w-full max-w-4xl flex-col gap-2 px-4 py-6 sm:px-6 lg:px-8'>
          {hasConversation && <EmptyState label='Selecciona una conversación' />}
          {hasConversation && loading ? <EmptyState label='Cargando mensajes...' /> : null}
          {hasConversation && !loading && messages.length === 0 ? (
            <EmptyState label='No hay mensaje todavía' />
          ) : null}
          {error ? <EmptyState label={error} /> : null}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {<div ref={bottomRef} />}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        className='flex w-2 touch-none bg-transparent p-0.5'
        orientation='vertical'
      >
        <ScrollArea.Thumb className='flex-1 rounded-full bg-slate-400/70' />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

type MessageBubbleProps = {
  message: Message;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useUserContext();
  const [downloads, setDownloads] = useState<Map<string, string>>(new Map());
  const isOwn = message.senderId === user?.id;

  useEffect(() => {
    if (!message.attachments || message.attachments.length === 0) {
      return;
    }

    const downloads: { id: string; url: string }[] = [];

    async function getDownloadUrls() {
      for (const attachment of message.attachments) {
        const result = await fileService.downloadFile({ attachmentId: attachment.id });
        downloads.push({ id: attachment.id, url: result.url });
      }

      setDownloads(new Map(downloads.map((download) => [download.id, download.url])));
    }

    getDownloadUrls();
  }, [message]);

  return (
    <article className={isOwn ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'max-w-[min(76%,620px)] rounded-lg px-3 py-2 shadow-sm',
          isOwn ? 'rounded-br-sm bg-bg-bubble-own' : 'rounded-bl-sm bg-bg-bubble-other',
        ].join(' ')}
      >
        {/*    {!isOwn && message.senderName ? (
          <p className='mb-1 text-sm font-semibold text-accent'>{message.senderName}</p>
        ) : null} */}
        <p className='whitespace-pre-wrap wrap-break-word text-[15px] leading-5'>
          {message.content}
        </p>
        {message.attachments?.length > 0 && (
          <ul className='my-2 space-y-2'>
            {message.attachments.map((attachment) => {
              const url = downloads.get(attachment.id);
              if (!url) return null;

              if (attachment.contentType.startsWith('audio/')) {
                return (
                  <li key={attachment.id}>
                    <audio controls preload='auto' src={url} className='max-w-full' />
                  </li>
                );
              }

              return (
                <li key={attachment.id} className='text-accent'>
                  <a href={url} download={attachment.fileName} className='hover:underline'>
                    {attachment.fileName}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div className='mt-1 flex items-center justify-end gap-1 text-[11px] text-text-secondary'>
          <time>
            {format(new Date(message.createdAt), 'dd MMM HH:mm', {
              locale: es,
            })}
          </time>
          {isOwn ? <span className='text-accent'>✓✓</span> : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className='mx-auto my-auto rounded-lg bg-bg-app/85 px-4 py-2 text-sm text-text-secondary shadow-sm'>
      {label}
    </div>
  );
}
