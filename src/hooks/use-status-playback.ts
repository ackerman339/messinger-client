import { useEffect, useRef, useState } from 'react';

export function statusProgress(position: number, duration: number) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, position / duration));
}

export function useTimedStatusProgress(duration: number, playing: boolean, onEnd: () => void) {
  const [elapsed, setElapsed] = useState(0);
  const position = useRef(0);
  const finished = useRef(false);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (!playing || duration <= 0 || finished.current) return;
    const start = performance.now() - position.current;
    const timer = setInterval(() => {
      position.current = Math.min(duration, performance.now() - start);
      setElapsed(position.current);

      if (position.current >= duration) {
        finished.current = true;
        clearInterval(timer);
        onEndRef.current();
      }
    }, 80);

    return () => {
      clearInterval(timer);
      if (!finished.current) position.current = Math.min(duration, performance.now() - start);
    };
  }, [duration, playing]);

  return statusProgress(elapsed, duration);
}
