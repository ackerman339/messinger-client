import { LocationCompose } from './location-compose';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { ChevronRight, Smile } from 'lucide-react';
import { useChatContext } from '@context/chat-context';
import { VoiceRecorder } from '@components/chat/voice-recorder';
import { AttachmentMenu } from './attachment-menu';

import EmojiPicker from 'emoji-picker-react';
import es from 'emoji-picker-react/dist/data/emojis-es.js';

import type { EmojiClickData } from 'emoji-picker-react';
import type { ReactNode, SubmitEvent } from 'react';

export function MessageComposer() {
  const {
    activeConversation,
    receiverId,
    isLoadingAttachment,
    prepareAttachments,
    handleSendMessage,
  } = useChatContext();

  const [message, setMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled =
    !!activeConversation?.isDeleted ||
    (!activeConversation && !receiverId);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 256)}px`;
  }, [message]);

  function handleChange(value: string) {
    setMessage(value);
  }

  function submitMessage(content: string) {
    const saved = handleSendMessage(content, []);
    setSendError(saved ? '' : 'No se pudo guardar el mensaje en este dispositivo.');
    return saved;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const content = message.trim();

    if (!content || disabled) {
      return;
    }

    if (!submitMessage(content)) return;
    setMessage('');
    setEmojiPickerOpen(false);
  }

  function handleClick() {
    const content = message.trim();

    if (!content || disabled) {
      return;
    }

    if (!submitMessage(content)) return;
    setMessage('');
    setEmojiPickerOpen(false);
  }

  function handleEmojiClick(emojiData: EmojiClickData) {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd } = textarea;

    const nextMessage =
      message.slice(0, selectionStart) +
      emojiData.emoji +
      message.slice(selectionEnd);

    const cursorPosition = selectionStart + emojiData.emoji.length;

    setMessage(nextMessage);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  async function uploadFiles(files: File[]) {
    if (disabled) {
      return;
    }

    try {
      const attachments = await prepareAttachments(files);

      if (!handleSendMessage('Nuevo archivo', attachments)) {
        setSendError('No se pudo guardar el mensaje en este dispositivo.');
        return;
      }
      setSendError('');
    } catch (error) {
      console.error('[attachments] failed to send files:', error);
      setSendError('No se pudo subir el archivo. Inténtalo de nuevo.');
    }
  }

  if (activeConversation?.isDeleted)
    return (
      <footer
        role='status'
        className='shrink-0 border-t border-border bg-bg-app p-5 text-center text-sm text-text-secondary'
      >
        Este grupo fue eliminado
      </footer>
    );

  return (
    <Tooltip.Provider delayDuration={150}>
      {locationOpen && (
        <LocationCompose
          onClose={() => setLocationOpen(false)}
          onSend={(location) => {
            const content = location.expiresAt ? 'Ubicación en tiempo real' : 'Ubicación compartida';
            const saved = handleSendMessage(content, [], location);
            if (saved) setLocationOpen(false);
            return saved;
          }}
        />
      )}
      {sendError && <p role='alert' className='px-3 text-sm text-red-600'>{sendError}</p>}
      <footer className='relative grid min-h-20 max-h-80 shrink-0 grid-cols-[auto_1fr_auto] gap-x-1 border-t border-border bg-bg-app px-2 py-3'>
        {emojiPickerOpen && (
          <div className='absolute bottom-full left-2 z-50 mb-2'>
            <EmojiPicker
              emojiData={es}
              onEmojiClick={handleEmojiClick}
              width={350}
              height={400}
            />
          </div>
        )}

        <div className='flex self-end'>
          <AttachmentMenu
            disabled={disabled || isLoadingAttachment}
            onFilesSelected={uploadFiles}
            onLocationSelected={() => setLocationOpen(true)}
          />

          <ComposerButton
            label='Emoji'
            icon={<Smile />}
            disabled={disabled || isLoadingAttachment}
            onClick={() => {
              setEmojiPickerOpen((open) => !open);
            }}
          />
        </div>

        <form className='self-center' onSubmit={handleSubmit}>
          <div className='rounded-xl bg-slate-100 px-4 py-2.5'>
            <span className='sr-only'>Escribe un mensaje</span>

            <textarea
              ref={textareaRef}
              className='block w-full resize-none bg-transparent text-[0.9375rem] leading-6 text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-50'
              placeholder='Escribe un mensaje'
              rows={1}
              disabled={disabled || isLoadingAttachment}
              value={message}
              onChange={(event) => {
                handleChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
        </form>

        <div className='flex self-end'>
          {message ? (
            <button
              className='grid size-11 place-items-center rounded-full bg-accent text-xl text-white transition hover:bg-accent-hover disabled:opacity-40'
              aria-label='enviar mensaje'
              title='Enviar mensaje'
              disabled={disabled || !message.trim() || isLoadingAttachment}
              onClick={handleClick}
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
  onClick: () => void;
};

function ComposerButton({
  label,
  icon,
  disabled,
  onClick,
}: ComposerButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className='grid size-11 cursor-pointer place-items-center rounded-full text-2xl text-text-secondary transition hover:bg-slate-100 hover:text-text-primary disabled:cursor-default disabled:opacity-40'
          type='button'
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
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
