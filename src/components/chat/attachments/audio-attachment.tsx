import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { fileService } from '@/services/files';

type AudioAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
};

type LocalAudioSource = { controller: AbortController; url?: string };

const initialTimeline = { currentTime: 0, duration: 0, canSeek: false };

function finiteTime(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatTime(value: number) {
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

async function playAudio(audio: HTMLAudioElement) {
  const controller = new AbortController();
  try {
    // A media error can also arrive while play() is still waiting for data.
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener('error', () => reject(audio.error), { signal: controller.signal });
      audio.play().then(resolve, reject);
    });
  } finally {
    controller.abort();
  }
}

function wasPlaybackInterrupted(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NotAllowedError')
  );
}

export function AudioAttachment({ attachmentId, fileName, contentType }: AudioAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const finished = useRef(false);
  const localSource = useRef<LocalAudioSource | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [timeline, setTimeline] = useState(initialTimeline);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoadingUrl(true);
        setError('');
        setIsPlaying(false);
        setIsBuffering(false);
        finished.current = false;
        setTimeline(initialTimeline);
        const result = await fileService.downloadFile({ attachmentId });

        if (!cancelled) setUrl(result.url);
      } catch (error) {
        if (!cancelled) {
          console.error('[audio] failed to get URL:', error);
          setError('No se pudo cargar el audio');
        }
      } finally {
        if (!cancelled) setIsLoadingUrl(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      const source = localSource.current;
      localSource.current = null;
      source?.controller.abort();
      if (source?.url) URL.revokeObjectURL(source.url);
    };
  }, [attachmentId, attempt]);

  const syncTimeline = useCallback((audio: HTMLAudioElement, ended = audio.ended) => {
    const currentTime = finiteTime(audio.currentTime);
    const metadataDuration = finiteTime(audio.duration);
    const seekable = audio.seekable;
    const start = seekable.length ? seekable.start(0) : 0;
    const seekableEnd = seekable.length ? finiteTime(seekable.end(seekable.length - 1)) : 0;

    setTimeline((previous) => {
      const observedDuration = ended
        ? currentTime || previous.duration
        : Math.max(previous.duration, seekableEnd);
      const duration = metadataDuration || observedDuration;
      return {
        currentTime: ended ? duration : duration ? Math.min(currentTime, duration) : currentTime,
        duration,
        canSeek: seekableEnd > start,
      };
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isLoadingUrl || error || typeof OfflineAudioContext === 'undefined') return;

    const controller = new AbortController();
    function cancelIfDurationKnown() {
      if (audio && (finiteTime(audio.duration) || (audio.ended && finiteTime(audio.currentTime)))) {
        controller.abort();
        syncTimeline(audio);
      }
    }
    audio.addEventListener('durationchange', cancelIfDurationKnown);
    audio.addEventListener('ended', cancelIfDurationKnown);

    const timeout = setTimeout(async () => {
      cancelIfDurationKnown();
      if (controller.signal.aborted) return;

      try {
        const bytes = await fileService.downloadAudioBytes(attachmentId, controller.signal);
        if (controller.signal.aborted) return;

        // Some recorded files omit the duration from their headers.
        const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes);
        cancelIfDurationKnown();
        if (controller.signal.aborted || audioRef.current !== audio) return;

        const duration = finiteTime(decoded.duration);
        if (!duration) return;
        const ended = audio.ended;
        setTimeline((previous) => ({
          ...previous,
          duration,
          currentTime: ended ? duration : Math.min(previous.currentTime, duration),
        }));
      } catch {
        // Native playback can still report the duration later.
      }
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
      audio.removeEventListener('durationchange', cancelIfDurationKnown);
      audio.removeEventListener('ended', cancelIfDurationKnown);
    };
  }, [attachmentId, error, isLoadingUrl, syncTimeline, url]);

  function finishPlayback() {
    setIsPlaying(false);
    setIsBuffering(false);
  }

  function handlePlaybackError(error: unknown) {
    console.error('[audio] failed to play:', error);
    finishPlayback();
    setError('No se pudo reproducir el audio');
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || (localSource.current && !localSource.current.url)) return;

    const duration = finiteTime(audio.duration);
    const atEnd =
      finished.current || audio.ended || (duration > 0 && audio.currentTime >= duration);
    if (!audio.paused && !atEnd && !audio.error) {
      audio.pause();
      return;
    }

    try {
      if (atEnd) {
        // Reopen the media at its start, including recordings that Chrome cannot rewind.
        finished.current = false;
        audio.load();
        setTimeline((previous) => ({ ...previous, currentTime: 0 }));
      }

      setIsBuffering(true);
      try {
        if (audio.error) throw audio.error;
        await playAudio(audio);
      } catch (error) {
        if (audioRef.current !== audio || wasPlaybackInterrupted(error)) return;
        if (localSource.current) throw error;

        // Use the complete file if the browser cannot play the signed R2 response.
        const controller = new AbortController();
        const source: LocalAudioSource = { controller };
        localSource.current = source;
        setIsBuffering(true);
        const bytes = await fileService.downloadAudioBytes(attachmentId, controller.signal);
        if (controller.signal.aborted || audioRef.current !== audio) return;

        const mimeType = contentType.split(';')[0].trim().toLowerCase();
        const type = mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a' ? 'audio/mp4' : mimeType;
        source.url = URL.createObjectURL(new Blob([bytes], { type }));
        audio.src = source.url;
        setTimeline((previous) => ({ ...previous, currentTime: 0, canSeek: false }));
        await playAudio(audio);
      }
    } catch (error) {
      if (audioRef.current !== audio) return;
      if (!wasPlaybackInterrupted(error)) handlePlaybackError(error);
    } finally {
      if (audioRef.current === audio) setIsBuffering(false);
    }
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const time = event.currentTarget.valueAsNumber;
    if (!audio?.seekable.length || !Number.isFinite(time)) return;

    const start = audio.seekable.start(0);
    const end = audio.seekable.end(audio.seekable.length - 1);
    finished.current = false;
    audio.currentTime = Math.min(end, Math.max(start, time));
    syncTimeline(audio);
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
      <div className='flex min-h-12 w-72 max-w-full flex-wrap items-center justify-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-sm text-text-secondary'>
        <span role='status'>{error || 'No se pudo cargar el audio'}</span>
        <button
          type='button'
          className='cursor-pointer font-medium text-accent-ink hover:underline'
          onClick={() => {
            setIsLoadingUrl(true);
            setAttempt((previous) => previous + 1);
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className='flex h-12 w-72 max-w-full items-center gap-2 rounded-lg bg-slate-100 px-2'>
      <audio
        ref={audioRef}
        src={url}
        preload='auto'
        loop={false}
        className='hidden'
        aria-label={fileName}
        onLoadedMetadata={({ currentTarget }) => syncTimeline(currentTarget)}
        onDurationChange={({ currentTarget }) => syncTimeline(currentTarget)}
        onProgress={({ currentTarget }) => syncTimeline(currentTarget)}
        onTimeUpdate={({ currentTarget }) => syncTimeline(currentTarget)}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => setIsBuffering(false)}
        onPause={finishPlayback}
        onWaiting={({ currentTarget }) => {
          if (!currentTarget.paused && !currentTarget.ended) setIsBuffering(true);
        }}
        onCanPlay={({ currentTarget }) => {
          setIsBuffering(false);
          syncTimeline(currentTarget);
        }}
        onEnded={({ currentTarget }) => {
          finished.current = true;
          finishPlayback();
          syncTimeline(currentTarget, true);
        }}
        onError={finishPlayback}
      />

      <button
        type='button'
        onClick={togglePlay}
        disabled={isBuffering && !isPlaying}
        className='grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70 cursor-pointer'
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isBuffering && !isPlaying ? (
          <LoaderCircle size={17} className='animate-spin' />
        ) : isPlaying ? (
          <Pause size={17} fill='currentColor' />
        ) : (
          <Play size={17} fill='currentColor' />
        )}
      </button>

      <span className='w-8 shrink-0 text-[0.6875rem] text-text-secondary'>
        {formatTime(timeline.currentTime)}
      </span>

      <input
        type='range'
        min={0}
        max={timeline.duration}
        step='any'
        value={timeline.duration ? timeline.currentTime : 0}
        onChange={handleSeek}
        disabled={!timeline.duration || !timeline.canSeek}
        className='h-1 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default'
        aria-label='Progreso del audio'
      />

      <span className='w-8 shrink-0 text-[0.6875rem] text-text-secondary'>
        {timeline.duration ? formatTime(timeline.duration) : '–:–'}
      </span>
    </div>
  );
}
