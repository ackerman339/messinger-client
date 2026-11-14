import { useChatContext } from '@context/chat-context';
import { useCallContext } from '@context/call-context';
import { isTerminal } from '@/types/call';

export function useCallActions(participantId: string) {
  const { activeConversation } = useChatContext();
  const { call, handleStartCall } = useCallContext();

  return {
    busy: !!call && (call.status === 'requesting' || !isTerminal(call.status)),
    startAudio: () =>
      handleStartCall(participantId, 'audio', activeConversation?.id),
    startVideo: () =>
      handleStartCall(participantId, 'video', activeConversation?.id),
  };
}
