import { X } from 'lucide-react';
import { useChatContext } from '@/context/chat-context';
import { useContactsContext } from '@/context/contacts-context';
import { useUserContext } from '@/context/user-context';
import { replyAuthor } from '@/services/message-actions';
import type { MessageReply } from '@/types/conversation';

export function MessageQuote({ reply, onClear }: { reply: MessageReply; onClear?: () => void }) {
  const { activeConversation } = useChatContext();
  const { user } = useUserContext();
  const { contacts } = useContactsContext();
  return (
    <div className='mb-1 flex min-w-0 items-center gap-2 rounded border-l-3 border-accent bg-bg-chat px-2 py-1.5'>
      <div className='min-w-0 flex-1 text-xs'>
        <p className='truncate font-bold'>
          {replyAuthor(reply, activeConversation, user?.id, contacts)}
        </p>
        <p className='line-clamp-2 wrap-anywhere text-text-secondary'>{reply.excerpt}</p>
      </div>
      {onClear && (
        <button
          type='button'
          onClick={onClear}
          aria-label='Cancelar respuesta'
          className='shrink-0 cursor-pointer rounded-full p-2 text-text-secondary hover:bg-bg-app'
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
