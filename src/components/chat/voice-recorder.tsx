import { Mic, Square, Trash2 } from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/use-voice-recorder';
import { useChatContext } from '../../context/chat-context';

export function VoiceRecorder() {
  const { prepareAttachments, handleSendMessage } = useChatContext();
  const { isRecording, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  async function handleStart() {
    try {
      await startRecording();
    } catch (error) {
      console.error('[voice] failed to start recording:', error);
    }
  }

  async function handleStop() {
    const blob = await stopRecording();

    if (!blob.size) {
      return;
    }

    const extension = blob.type.includes('ogg')
      ? 'ogg'
      : blob.type.includes('mp4')
        ? 'mp4'
        : 'webm';

    const file = new File([blob], `voice-${crypto.randomUUID()}.${extension}`, {
      type: blob.type,
    });

    const attachments = await prepareAttachments([file]);
    handleSendMessage('Nota de voz', attachments);
  }

  function handleCancel() {
    cancelRecording();
  }

  if (!isRecording) {
    return (
      <button
        type='button'
        onClick={handleStart}
        className='grid size-11 place-items-center rounded-full hover:bg-slate-100 cursor-pointer'
        aria-label='Record voice message'
        title='Record voice message'
      >
        <Mic />
      </button>
    );
  }

  return (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        onClick={handleCancel}
        className='grid size-11 place-items-center rounded-full hover:bg-slate-100 cursor-pointer'
        aria-label='Cancel recording'
        title='Cancel recording'
      >
        <Trash2 />
      </button>

      <div className='flex items-center gap-2'>
        <span className='size-2 animate-pulse rounded-full bg-red-500' />

        <span className='text-sm'>Recording...</span>
      </div>

      <button
        type='button'
        onClick={handleStop}
        className='grid size-11 place-items-center rounded-full bg-accent text-white cursor-pointer'
        aria-label='Stop recording'
        title='Stop recording'
      >
        <Square size={18} />
      </button>
    </div>
  );
}
