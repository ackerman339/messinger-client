/** One looping, original chime per incoming call. */
export function createCallRingtone() {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/incoming-call.wav`);
  audio.loop = true;
  audio.volume = 0.6;
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
