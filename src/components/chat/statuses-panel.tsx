import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, Dialog } from 'radix-ui';
import { ChevronLeft, ChevronRight, CirclePlus, Eye, Trash2, X } from 'lucide-react';
import { useStatusViewers, type StatusGroup, type useStatuses } from '@/hooks/use-statuses';
import { statusProgress, useTimedStatusProgress } from '@/hooks/use-status-playback';
import { STATUS_MEDIA_TYPES, statusDuration } from '@/services/statuses';

type Feed = ReturnType<typeof useStatuses>;

export function StatusesPanel({ feed }: { feed: Feed }) {
  const [publishing, setPublishing] = useState(false);
  const recent = feed.others.filter((group) => group.unseen);
  const viewed = feed.others.filter((group) => !group.unseen);

  return (
    <section className='min-h-0 flex-1 overflow-y-auto p-3' aria-label='Estados'>
      <button
        type='button'
        onClick={() => setPublishing(true)}
        disabled={!feed.online}
        className='flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left enabled:cursor-pointer enabled:hover:bg-bg-chat disabled:opacity-50'
      >
        <CirclePlus className='shrink-0 text-accent-ink' size={30} aria-hidden='true' />
        <span className='font-semibold'>Publicar estado</span>
      </button>
      {feed.own && <StatusRow group={feed.own} name='Mi estado' onOpen={feed.open} />}
      {!feed.online && (
        <p role='status' className='px-3 py-2 text-sm text-text-secondary'>
          Conéctate para consultar o publicar estados.
        </p>
      )}
      {feed.loading && (
        <p role='status' className='px-3 py-2 text-sm text-text-secondary'>
          Cargando estados…
        </p>
      )}
      {feed.error && (
        <div className='flex flex-wrap items-center gap-2 px-3 py-2 text-sm'>
          <span role='alert'>{feed.error}</span>
          <button
            type='button'
            onClick={() => void feed.refresh()}
            className='cursor-pointer text-accent-ink underline'
          >
            Reintentar
          </button>
        </div>
      )}
      {feed.online && !feed.loading && !feed.error && !feed.others.length && (
        <p className='px-3 py-2 text-sm text-text-secondary'>
          Tus contactos aún no han publicado estados.
        </p>
      )}
      {recent.length > 0 && <StatusSection title='Recientes' groups={recent} onOpen={feed.open} />}
      {viewed.length > 0 && <StatusSection title='Vistos' groups={viewed} onOpen={feed.open} />}
      {publishing && <PublishStatus feed={feed} onClose={() => setPublishing(false)} />}
      {feed.current && <StatusViewer feed={feed} key={feed.current.authorId} />}
    </section>
  );
}

function StatusSection({
  title,
  groups,
  onOpen,
}: {
  title: string;
  groups: StatusGroup[];
  onOpen: Feed['open'];
}) {
  return (
    <section>
      <h3 className='px-3 pt-4 pb-2 text-xs font-semibold text-text-secondary'>{title}</h3>
      {groups.map((group) => (
        <StatusRow key={group.authorId} group={group} onOpen={onOpen} />
      ))}
    </section>
  );
}

function StatusRow({
  group,
  name = group.name,
  onOpen,
}: {
  group: StatusGroup;
  name?: string;
  onOpen: Feed['open'];
}) {
  return (
    <button
      type='button'
      onClick={() => onOpen(group)}
      className='flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-bg-chat'
    >
      <Avatar.Root
        className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-bg-chat text-xs font-bold ${group.unseen ? 'border-accent' : 'border-border'}`}
      >
        <Avatar.Image
          src={group.avatarUrl ?? undefined}
          className='size-full object-cover'
          alt=''
        />
        <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar.Root>
      <span className='min-w-0'>
        <span className='block truncate font-semibold'>{name}</span>
        <span className='block text-xs text-text-secondary'>
          {group.items.length} {group.items.length === 1 ? 'estado' : 'estados'}
        </span>
      </span>
    </button>
  );
}

function PublishStatus({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await feed.publish(text, file)) onClose();
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !feed.busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-60 bg-black/50' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-70 max-h-[90dvh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-bg-app p-5 shadow-xl'>
          <div className='flex items-center justify-between gap-2'>
            <Dialog.Title className='text-lg font-semibold'>Publicar estado</Dialog.Title>
            <Dialog.Close
              className='cursor-pointer rounded-full p-2 hover:bg-bg-chat'
              disabled={feed.busy}
              aria-label='Cerrar'
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className='mt-2 text-sm text-text-secondary'>
            Disponible durante 24 horas para las personas que tienes guardadas y que también te
            tienen como contacto.
          </Dialog.Description>
          <form className='mt-4 space-y-3' onSubmit={(event) => void publish(event)}>
            <textarea
              aria-label='Texto del estado'
              placeholder='Escribe un estado'
              rows={4}
              maxLength={700}
              className='block w-full resize-y rounded-lg bg-bg-chat p-3'
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={feed.busy}
            />
            <label className='block text-sm'>
              Foto o video
              <input
                type='file'
                accept={STATUS_MEDIA_TYPES.join(',')}
                onChange={(event) => setFile(event.target.files?.[0])}
                disabled={feed.busy}
                className='block w-full cursor-pointer py-2 text-sm file:mr-2 file:rounded-lg file:bg-bg-chat file:px-2 file:py-1'
              />
            </label>
            {feed.mutationError && (
              <p role='alert' className='text-sm text-danger'>
                {feed.mutationError}
              </p>
            )}
            <button
              disabled={feed.busy || (!text.trim() && !file)}
              className='w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white enabled:cursor-pointer disabled:opacity-40'
            >
              {feed.busy ? 'Publicando…' : 'Publicar'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type StatusVideoProps = {
  url: string;
  requiresCredentials?: true;
  onProgress: (value: number) => void;
  onEnd: () => void;
  onError: () => void;
};

function StatusVideo({ url, requiresCredentials, onProgress, onEnd, onError }: StatusVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    let active = true;
    void player.play().catch((error: unknown) => {
      if (!active || !(error instanceof DOMException) || error.name !== 'NotAllowedError') return;
      player.muted = true;
      void player.play().catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [url]);

  function updateProgress(event: React.SyntheticEvent<HTMLVideoElement>) {
    const { currentTime, duration } = event.currentTarget;
    onProgress(statusProgress(currentTime, duration));
  }

  return (
    <video
      ref={ref}
      className='min-h-0 max-h-full w-full object-contain'
      src={url}
      crossOrigin={requiresCredentials ? 'use-credentials' : undefined}
      playsInline
      controls
      onLoadedMetadata={updateProgress}
      onTimeUpdate={updateProgress}
      onEnded={onEnd}
      onError={onError}
    />
  );
}

function StatusProgressFill({ value }: { value: number }) {
  return (
    <div
      className='h-full bg-white transition-[width] duration-100 ease-linear'
      style={{ width: `${value * 100}%` }}
    />
  );
}

function TimedStatusProgress({
  duration,
  playing,
  onEnd,
}: {
  duration: number;
  playing: boolean;
  onEnd: () => void;
}) {
  const progress = useTimedStatusProgress(duration, playing, onEnd);
  return <StatusProgressFill value={progress} />;
}

function StatusViewer({ feed }: { feed: Feed }) {
  const [imageLoaded, setImageLoaded] = useState('');
  const [failedMedia, setFailedMedia] = useState('');
  const automaticallyRetried = useRef('');
  const [paused, setPaused] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [viewersId, setViewersId] = useState('');
  const { current, currentGroup, media, retryMedia: loadMediaAgain, step } = feed;
  const showViewers = feed.isOwn && !!current && current.id === viewersId;
  const viewers = useStatusViewers(showViewers ? viewersId : undefined);
  const video = current?.contentType?.startsWith('video/');
  const currentId = current?.id;
  const position = currentGroup?.items.findIndex((item) => item.id === currentId) ?? -1;
  const ready = !!current && (!current.contentType || imageLoaded === currentId);
  const busy = feed.busy;
  const canPlay = !showViewers && !busy;
  const move = useCallback(
    (offset: number) => {
      if (busy || (offset < 0 && position <= 0)) return;
      setPaused(false);
      setImageLoaded('');
      setFailedMedia('');
      automaticallyRetried.current = '';
      setVideoProgress(0);
      step(offset);
    },
    [busy, position, step],
  );
  const advance = useCallback(() => {
    if (canPlay) move(1);
  }, [canPlay, move]);
  const retryMedia = useCallback(() => {
    setImageLoaded('');
    setFailedMedia('');
    setVideoProgress(0);
    loadMediaAgain();
  }, [loadMediaAgain]);
  const handleMediaError = useCallback(() => {
    if (!currentId) return;
    if (automaticallyRetried.current !== currentId) {
      automaticallyRetried.current = currentId;
      retryMedia();
      return;
    }
    setFailedMedia(currentId);
  }, [currentId, retryMedia]);

  function toggleViewers() {
    if (video) setVideoProgress(0);
    else if (showViewers) setImageLoaded('');
    setViewersId(showViewers ? '' : (currentId ?? ''));
  }

  if (!current || !currentGroup) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !feed.busy) feed.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-80 bg-black/75' />
        <Dialog.Content
          className='fixed inset-x-0 top-1/2 z-90 mx-auto flex h-[min(100dvh,800px)] w-[min(100%,560px)] -translate-y-1/2 flex-col bg-slate-900 text-white shadow-2xl'
          onKeyDown={(event) => {
            if (event.target instanceof HTMLVideoElement) return;
            if (event.key === 'ArrowLeft') move(-1);
            if (event.key === 'ArrowRight') move(1);
          }}
        >
          <div className='flex gap-1 p-3 pb-0' aria-hidden='true'>
            {currentGroup.items.map((item, index) => (
              <div
                key={item.id}
                className={`h-1 flex-1 overflow-hidden rounded ${index < position ? 'bg-white' : 'bg-white/25'}`}
              >
                {index === position &&
                  (video ? (
                    <StatusProgressFill value={videoProgress} />
                  ) : (
                    <TimedStatusProgress
                      duration={statusDuration(current)}
                      playing={canPlay && ready && !paused}
                      onEnd={advance}
                    />
                  ))}
              </div>
            ))}
          </div>
          <header className='flex shrink-0 items-center justify-between gap-3 p-3'>
            <div className='min-w-0'>
              <Dialog.Title className='truncate font-semibold'>
                {feed.isOwn ? 'Mi estado' : currentGroup.name}
              </Dialog.Title>
              <Dialog.Description className='text-xs text-white/75'>
                {position + 1} de {currentGroup.items.length}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label='Cerrar estado'
              className='cursor-pointer rounded-full p-2 hover:bg-white/15'
              disabled={feed.busy}
            >
              <X size={22} />
            </Dialog.Close>
          </header>
          {showViewers ? (
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
              {viewers.loading ? (
                <p role='status'>Cargando vistas…</p>
              ) : viewers.error ? (
                <p role='alert'>No se pudieron cargar las vistas.</p>
              ) : viewers.viewers.length ? (
                <ul className='space-y-3'>
                  {viewers.viewers.map((viewer) => (
                    <li key={viewer.userId}>{viewers.name(viewer)}</li>
                  ))}
                </ul>
              ) : (
                <p>Nadie ha visto este estado todavía.</p>
              )}
            </div>
          ) : (
            <div className='flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3'>
              {current.contentType &&
                (feed.mediaError || failedMedia === current.id ? (
                  <div className='space-y-2 text-center'>
                    <p role='alert'>No se pudo cargar el archivo del estado.</p>
                    <button
                      type='button'
                      className='cursor-pointer rounded-lg px-3 py-2 hover:bg-white/15'
                      onClick={retryMedia}
                    >
                      Reintentar
                    </button>
                  </div>
                ) : !media ? (
                  <p role='status'>Cargando…</p>
                ) : video ? (
                  <StatusVideo
                    key={current.id}
                    url={media.uri}
                    requiresCredentials={media.requiresCredentials}
                    onProgress={setVideoProgress}
                    onEnd={advance}
                    onError={handleMediaError}
                  />
                ) : (
                  <img
                    key={current.id}
                    className='min-h-0 max-h-full w-full object-contain'
                    src={media.uri}
                    crossOrigin={media.requiresCredentials ? 'use-credentials' : undefined}
                    alt='Foto del estado'
                    onLoad={() => setImageLoaded(current.id)}
                    onError={handleMediaError}
                  />
                ))}
              {current.text && (
                <p
                  className={`max-w-full whitespace-pre-wrap wrap-anywhere p-3 text-center ${current.contentType ? 'text-base' : 'text-2xl'}`}
                >
                  {current.text}
                </p>
              )}
            </div>
          )}
          {feed.mutationError && (
            <p role='alert' className='px-3 text-sm'>
              {feed.mutationError}
            </p>
          )}
          <footer className='flex shrink-0 flex-wrap items-center justify-between gap-2 p-3'>
            <button
              type='button'
              onClick={() => move(-1)}
              disabled={position === 0 || feed.busy}
              aria-label='Estado anterior'
              className='rounded-full p-2 enabled:cursor-pointer enabled:hover:bg-white/15 disabled:opacity-30'
            >
              <ChevronLeft size={24} />
            </button>
            {feed.isOwn ? (
              <>
                <button
                  type='button'
                  aria-label={showViewers ? 'Volver al estado' : 'Ver quién vio el estado'}
                  onClick={toggleViewers}
                  className='flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-white/15'
                >
                  <Eye size={18} aria-hidden='true' />
                  {showViewers ? 'Volver' : `${current.viewCount ?? 0} vistas`}
                </button>
                <button
                  type='button'
                  disabled={feed.busy}
                  aria-label='Eliminar estado'
                  className='rounded-full p-2 text-red-300 enabled:cursor-pointer enabled:hover:bg-white/15'
                  onClick={() => void feed.remove()}
                >
                  <Trash2 size={20} />
                </button>
              </>
            ) : null}
            {!video && !showViewers && (
              <button
                type='button'
                disabled={busy}
                className='cursor-pointer rounded-full px-3 py-2 text-sm hover:bg-white/15'
                onClick={() => setPaused(!paused)}
              >
                {paused ? 'Reanudar' : 'Pausar'}
              </button>
            )}
            <button
              type='button'
              onClick={() => move(1)}
              disabled={feed.busy}
              aria-label='Siguiente estado'
              className='cursor-pointer rounded-full p-2 hover:bg-white/15'
            >
              <ChevronRight size={24} />
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
