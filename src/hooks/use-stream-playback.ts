import { useCallback, useEffect, useRef, useState } from 'react';

export function useStreamPlayback(
  stream?: MediaStream,
  onElement?: (element: HTMLVideoElement | null) => void,
) {
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

  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      ref.current = element;
      onElement?.(element);
    },
    [onElement],
  );

  return { ref: attach, blocked, play };
}
