import { useCallContext } from '@context/call-context';
import { isTerminal } from '@/types/call';

export function useCallActions(participantId: string) {
  const { call, handleStartCall } = useCallContext();

  return {
    busy: !!call && (call.status === 'requesting' || !isTerminal(call.status)),
    startAudio: () => handleStartCall(participantId, 'audio'),
    startVideo: () => handleStartCall(participantId, 'video'),
  };
}
