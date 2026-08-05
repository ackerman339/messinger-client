import { useChatContext } from '../../context/chat-context';

export function TypingBar() {
  const { typingUserIds } = useChatContext();

  if (typingUserIds.length === 0) {
    return null;
  }

  return (
    <div className='border-t border-border/70 bg-bg-app/95 px-4 py-2 text-sm text-accent'>
      <div className='mx-auto flex max-w-4xl items-center gap-2'>
        <span className='flex gap-1' aria-hidden='true'>
          <span className='size-1.5 rounded-full bg-accent' />
          <span className='size-1.5 rounded-full bg-accent opacity-70' />
          <span className='size-1.5 rounded-full bg-accent opacity-40' />
        </span>
        <span className='truncate'>
          {typingUserIds.length === 1
            ? 'Someone is typing...'
            : `${typingUserIds.length} people are typing...`}
        </span>
      </div>
    </div>
  );
}
