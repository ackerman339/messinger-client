import { useEffect, useRef, useState } from 'react';
import { Pause, Play, LoaderCircle } from 'lucide-react';
import { fileService } from '@/services/files';

type AudioAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function AudioAttachment({ attachmentId, fileName }: AudioAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [url, setUrl] = useState<string | null>(null);

  const [isLoadingUrl, setIsLoadingUrl] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  /**
   * Obtiene la URL del archivo.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoadingUrl(true);
        setError(false);

        const result = await fileService.downloadFile({
          attachmentId,
        });

        if (cancelled) {
          return;
        }

        setUrl(result.url);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('[audio] failed to get URL:', error);
        setError(true);
      } finally {
        if (!cancelled) {
          setIsLoadingUrl(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  /**
   * Configura los eventos del elemento audio.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    function handleLoadedMetadata() {
      setDuration(audio!.duration);
    }

    function handleTimeUpdate() {
      setCurrentTime(audio!.currentTime);
    }

    function handlePlay() {
      setIsPlaying(true);
      setIsBuffering(false);
    }

    function handlePlaying() {
      setIsPlaying(true);
      setIsBuffering(false);
    }

    function handlePause() {
      setIsPlaying(false);
      setIsBuffering(false);
    }

    function handleWaiting() {
      setIsBuffering(true);
    }

    function handleCanPlay() {
      setIsBuffering(false);
    }

    function handleEnded() {
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(0);
    }

    function handleError() {
      console.error('[audio] media error:', audio!.error);

      setIsPlaying(false);
      setIsBuffering(false);
      setError(true);
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);

    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);

      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);

      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);

      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [url]);

  async function togglePlay() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      setIsBuffering(true);

      await audio.play();
    } catch (error) {
      setIsBuffering(false);

      console.error('[audio] failed to play:', error);
    }
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const time = Number(event.target.value);

    if (!Number.isFinite(time)) {
      return;
    }

    audio.currentTime = time;
    setCurrentTime(time);
  }

  function formatTime(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(value);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  if (isLoadingUrl) {
    return (
      <div className='flex h-12 w-72 items-center justify-center rounded-lg bg-slate-100'>
        <LoaderCircle className='animate-spin text-accent' size={20} />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className='flex h-12 w-72 items-center justify-center rounded-lg bg-slate-100 text-sm text-text-secondary'>
        No se pudo cargar el audio
      </div>
    );
  }

  return (
    <div className='flex h-12 w-72 max-w-full items-center gap-2 rounded-lg bg-slate-100 px-2'>
      <audio ref={audioRef} src={url} preload='auto' className='hidden' aria-label={fileName} />

      <button
        type='button'
        onClick={togglePlay}
        disabled={isBuffering}
        className='grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70 cursor-pointer'
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isBuffering ? (
          <LoaderCircle size={17} className='animate-spin' />
        ) : isPlaying ? (
          <Pause size={17} fill='currentColor' />
        ) : (
          <Play size={17} fill='currentColor' />
        )}
      </button>

      <span className='w-8 shrink-0 text-[11px] text-text-secondary'>
        {formatTime(currentTime)}
      </span>

      <input
        type='range'
        min={0}
        max={duration || 0}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
        disabled={!duration}
        className='h-1 min-w-0 flex-1 cursor-pointer accent-accent'
        aria-label='Progreso del audio'
      />

      <span className='w-8 shrink-0 text-[11px] text-text-secondary'>{formatTime(duration)}</span>
    </div>
  );
}
