import type { CallView } from '../state/call-session';

export type CallSound = 'incoming' | 'outgoing';

export function getCallSound(call: CallView | null): CallSound | undefined {
  if (!call || call.ending || call.answering) return;
  if (call.incoming) return call.status === 'ringing' ? 'incoming' : undefined;
  if (call.status === 'requesting' || call.status === 'ringing') return 'outgoing';
}

/** One looping tone per call, with a distinct ringback for the caller. */
export function createCallRingtone(sound: CallSound = 'incoming') {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/${sound}-call.wav`);
  audio.loop = true;
  audio.volume = sound === 'outgoing' ? 0.3 : 0.6;
  let stopped = false;

  async function play(): Promise<boolean> {
    if (stopped) return false;
    try {
      await audio.play();
      if (stopped) {
        audio.pause();
        audio.currentTime = 0;
      }
      return !stopped;
    } catch {
      return false;
    }
  }

  function stop() {
    stopped = true;
    audio.pause();
    audio.currentTime = 0;
  }

  return { play, stop };
}
