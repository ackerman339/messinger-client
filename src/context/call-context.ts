import { createContext, useContext } from 'react';

import type { CallMedia } from '@/types/call';
import type { CallView } from '@/state/call-session';

interface CallContextValue {
  call: CallView | null;
  handleStartCall: (participantId: string, media: CallMedia) => void;
  handleAcceptCall: () => void;
  handleRejectCall: () => void;
  handleEndCall: () => void;
  handleDismissCall: () => void;
  handleToggleMicrophone: () => void;
  handleToggleCamera: () => void;
  handleSwitchCamera: () => void;
}

export const CallContext = createContext<CallContextValue | undefined>(undefined);

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used within a <CallProvider>');
  return ctx;
}
