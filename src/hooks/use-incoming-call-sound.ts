import { useEffect } from 'react';
import { createCallRingtone } from '@services/call-ringtone';

export function useIncomingCallSound(incoming: boolean, callId?: string) {
  useEffect(() => {
    if (!incoming) return;
    const ringtone = createCallRingtone();
    const play = () => { void ringtone.play(); };

    play();
    // Retry on interaction when the browser blocks automatic playback.
    document.addEventListener('pointerdown', play);
    document.addEventListener('keydown', play);

    return () => {
      document.removeEventListener('pointerdown', play);
      document.removeEventListener('keydown', play);
      ringtone.stop();
    };
  }, [incoming, callId]);
}
