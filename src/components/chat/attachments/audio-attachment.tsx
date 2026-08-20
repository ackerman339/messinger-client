import { useEffect, useRef, useState } from 'react';
import { format, intervalToDuration } from 'date-fns';
import { Pause, Play, Volume2, VolumeX, LoaderCircle } from 'lucide-react';

import { fileService } from '@/services/files';

type AudioAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function AudioAttachment({ attachmentId, fileName }: AudioAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
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

        console.error('[attachment:audio] failed to load:', error);

        setError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    function handleLoadedMetadata() {
      if (!audio) {
        return;
      }

      setDuration(audio.duration);
    }

    function handleTimeUpdate() {
      if (!audio) {
        return;
      }

      setCurrentTime(audio.currentTime);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(0);
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  function togglePlay() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      audio.play().catch((error) => {
        console.error('[audio] failed to play:', error);
      });
    } else {
      audio.pause();
    }
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const time = Number(event.target.value);

    audio.currentTime = time;
    setCurrentTime(time);
  }

  function handleVolumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const nextVolume = Number(event.target.value);

    audio.volume = nextVolume;
    setVolume(nextVolume);
  }

  function toggleMute() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.volume === 0) {
      audio.volume = volume || 1;
    } else {
      audio.volume = 0;
    }
  }
  function formatTime(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      return '0:00';
    }

    const duration = intervalToDuration({
      start: 0,
      end: value * 1000,
    });

    const minutes = duration.minutes ?? 0;
    const seconds = duration.seconds ?? 0;

    return format(new Date(0, 0, 0, 0, minutes, seconds), 'm:ss');
  }

  if (isLoading) {
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
      <audio ref={audioRef} src={url} preload='metadata' className='hidden' aria-label={fileName} />

      <button
        type='button'
        onClick={togglePlay}
        className='grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:bg-accent-hover cursor-pointer'
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isPlaying ? (
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
        className='h-1 min-w-0 flex-1 cursor-pointer accent-accent'
        aria-label='Progreso del audio'
      />

      <span className='w-8 shrink-0 text-[11px] text-text-secondary'>{formatTime(duration)}</span>

      <button
        type='button'
        onClick={toggleMute}
        className='grid size-8 shrink-0 place-items-center rounded-full text-text-secondary transition hover:bg-slate-200 hover:text-text-primary'
        aria-label={volume === 0 ? 'Activar sonido' : 'Silenciar'}
      >
        {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>

      <input
        type='range'
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={handleVolumeChange}
        className='hidden'
        aria-label='Volumen'
      />
    </div>
  );
}
