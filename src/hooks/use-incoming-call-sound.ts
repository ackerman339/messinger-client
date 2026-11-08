import { useEffect, useRef, useState } from 'react';
import { createCallRingtone } from '@services/call-ringtone';

export function useIncomingCallSound(incoming: boolean, callId?: string) {
  const [blocked, setBlocked] = useState(false);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    if (!incoming) return;
    const ringtone = createCallRingtone();
    let active = true;

    async function play() {
      const playing = await ringtone.play();
      if (active) setBlocked(!playing);
    }

    retry.current = () => {
      void play();
    };
    void play();
    // Browsers may require a user gesture before playing an incoming ringtone.
    document.addEventListener('pointerdown', play);
    document.addEventListener('keydown', play);

    return () => {
      active = false;
      retry.current = () => {};
      document.removeEventListener('pointerdown', play);
      document.removeEventListener('keydown', play);
      ringtone.stop();
    };
  }, [incoming, callId]);

  return { soundBlocked: incoming && blocked, enableSound: () => retry.current() };
}
