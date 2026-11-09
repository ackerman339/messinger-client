import { useEffect } from 'react';
import { createCallRingtone } from '@services/call-ringtone';
import type { CallSound } from '@services/call-ringtone';

/** Keeps one tone alive while ringing, including retries after blocked autoplay. */
export function useCallSound(sound?: CallSound, callKey?: string) {
  useEffect(() => {
    if (!sound) return;
    const ringtone = createCallRingtone(sound);
    const play = () => {
      void ringtone.play();
    };
    play();
    document.addEventListener('pointerdown', play);
    document.addEventListener('keydown', play);
    return () => {
      document.removeEventListener('pointerdown', play);
      document.removeEventListener('keydown', play);
      ringtone.stop();
    };
  }, [sound, callKey]);
}
