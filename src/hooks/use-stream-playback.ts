import { useEffect, useRef, useState } from 'react';

export function useStreamPlayback(stream?: MediaStream) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = ref.current;

    if (!video) return;

    video.srcObject = stream ?? null;

    if (stream) video.play().catch(() => setBlocked(true));

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const play = () => {
    ref.current
      ?.play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  };

  return { ref, blocked, play };
}
