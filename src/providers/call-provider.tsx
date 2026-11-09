import { useNotificationCallAction } from '@hooks/use-notification-call-action';
import { useEffect, useState } from 'react';
import { createCallClient } from '@clients/call-client';
import { createCallNotifications } from '@services/call-notifications';
import { CallContext } from '@context/call-context';

import type { ReactNode } from 'react';
import type { CallMedia } from '@/types/call';
import type { CallView } from '@/state/call-session';

export function CallProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createCallClient());
  const [call, setCall] = useState<CallView | null>(null);

  useEffect(() => {
    const notifications = createCallNotifications(client.answerFromNotification);
    function refreshNotifications() {
      notifications.update(client.getSnapshot());
    }

    const unsubscribe = client.subscribe(() => {
      const snapshot = client.getSnapshot();
      setCall(snapshot);
      notifications.update(snapshot);
    });

    const unmount = client.mount();
    window.addEventListener('focus', refreshNotifications);

    return () => {
      unsubscribe();
      notifications.dispose();
      window.removeEventListener('focus', refreshNotifications);
      unmount();
    };
  }, [client]);

  useNotificationCallAction(client);

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

  function handleSwitchCamera() {
    void client.switchCamera();
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
        handleSwitchCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
