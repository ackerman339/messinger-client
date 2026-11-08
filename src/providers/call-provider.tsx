import { useEffect, useState } from 'react';
import { createCallClient } from '@clients/call-client';
import { CallContext } from '@context/call-context';

import type { ReactNode } from 'react';
import type { CallMedia } from '@/types/call';
import type { CallView } from '@/state/call-session';

export function CallProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createCallClient());
  const [call, setCall] = useState<CallView | null>(null);

  useEffect(() => {
    const unsubscribe = client.subscribe(() => {
      setCall(client.getSnapshot());
    });
    const unmount = client.mount();

    return () => {
      unsubscribe();
      unmount();
    };
  }, [client]);

  function handleStartCall(participantId: string, media: CallMedia) {
    client.start(participantId, media);
  }

  function handleAcceptCall() {
    client.accept();
  }

  function handleRejectCall() {
    client.end(true);
  }

  function handleEndCall() {
    client.end();
  }

  function handleDismissCall() {
    client.dismiss();
  }

  function handleToggleMicrophone() {
    client.toggle('audio');
  }

  function handleToggleCamera() {
    client.toggle('video');
  }

  return (
    <CallContext.Provider
      value={{
        call,
        handleStartCall,
        handleAcceptCall,
        handleRejectCall,
        handleEndCall,
        handleDismissCall,
        handleToggleMicrophone,
        handleToggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
