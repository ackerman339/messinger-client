import { useRef, useState, useEffect } from 'react';
import { Tooltip } from 'radix-ui';
import { Smile, ChevronRight } from 'lucide-react';
import { useChatContext } from '@context/chat-context';
import { VoiceRecorder } from '@components/chat/voice-recorder';
import { AttachmentMenu } from './attachment-menu';

import type { ReactNode, SubmitEvent } from 'react';

export function MessageComposer() {
  const {
    activeConversation,
    receiverId,
    handleTypingStop,
    handleTypingStart,
    prepareAttachments,
    handleSendMessage,
  } = useChatContext();

  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = !activeConversation && !receiverId;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 256)}px`;
  }, [message]);

  function stopTypingSoon() {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      handleTypingStop();
    }, 700);
  }

  function handleChange(value: string) {
    setMessage(value);

    if (!value.trim()) {
      handleTypingStop();
      return;
    }

    handleTypingStart();
    stopTypingSoon();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const content = message.trim();
    if (!content) return;

    handleSendMessage(content, []);
    setMessage('');
    handleTypingStop();
  }

  async function uploadFiles(files: File[]) {
    const attachments = await prepareAttachments(files);
    handleSendMessage('Nuevo archivo', attachments);
  }

  return (
    <Tooltip.Provider delayDuration={150}>
      <footer className='grid min-h-20 max-h-80 grid-cols-[auto_1fr_auto] gap-x-1 shrink-0 border-t border-border bg-bg-app px-2 py-3'>
        <div className='self-end flex'>
          <AttachmentMenu disabled={disabled} onFilesSelected={uploadFiles} />
          <ComposerButton label='Emoji' icon={<Smile />} disabled={disabled} />
        </div>
        <form className='self-center' onSubmit={handleSubmit}>
          <div className='rounded-xl bg-slate-100 px-4 py-2.5'>
            <span className='sr-only'>Escribe un mensaje</span>
            <textarea
              ref={textareaRef}
              className='block w-full resize-none bg-transparent text-[15px] leading-6 text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-50'
              placeholder='Escribe un mensaje'
              rows={1}
              disabled={disabled}
              value={message}
              onBlur={handleTypingStop}
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
        </form>
        <div className='self-end flex'>
          {message ? (
            <button
              className='grid size-11 place-items-center rounded-full bg-accent text-xl text-white transition hover:bg-accent-hover disabled:opacity-40'
              type='submit'
              aria-label='enviar mensaje'
              title='Enviar mensaje'
              disabled={disabled || !message.trim()}
            >
              <ChevronRight />
            </button>
          ) : (
            <VoiceRecorder />
          )}
        </div>
      </footer>
    </Tooltip.Provider>
  );
}

type ComposerButtonProps = {
  label: string;
  icon: ReactNode;
  disabled: boolean;
};

function ComposerButton({ label, icon, disabled }: ComposerButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className='grid size-11 place-items-center rounded-full text-2xl text-text-secondary transition hover:bg-slate-100 hover:text-text-primary disabled:opacity-40 cursor-pointer'
          type='button'
          aria-label={label}
          disabled={disabled}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className='rounded bg-slate-900 px-2 py-1 text-xs text-white shadow'
          sideOffset={6}
        >
          {label}
          <Tooltip.Arrow className='fill-slate-900' />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
