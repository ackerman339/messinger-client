import { useEffect, useRef, useState } from 'react';
import { ChevronUp, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { ConnectionState } from 'livekit-client';
import { MAX_GROUP_CALL_PARTICIPANTS } from '@/lib/group-limits';
import type { AudioTrack, VideoTrack } from 'livekit-client';
import { useGroupCall } from './group-call-context';
import type { GroupCallView } from './group-call-context';
import { useGroupRoom } from './use-group-room';
import { GroupCallDialog } from './group-call-dialog';

function TrackAudio({ track }: { track: AudioTrack }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = element.current;
    if (!audio) return;
    track.attach(audio);
    return () => {
      track.detach(audio);
    };
  }, [track]);
  return <audio ref={element} autoPlay />;
}

function TrackVideo({ track, local }: { track: VideoTrack; local: boolean }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track]);
  return (
    <video
      ref={element}
      autoPlay
      playsInline
      muted
      className={`size-full object-cover ${local ? '-scale-x-100' : ''}`}
    />
  );
}

export default function GroupRoomPanel({ view }: { view: GroupCallView }) {
  const { room, call, title, preparingMedia, initialMediaError, tryingRelay, reconnecting } = view;
  const { canEnd, ending, end, leave, error } = useGroupCall();
  const {
    state,
    cameraEnabled,
    microphoneEnabled,
    participants,
    audio,
    canPlayAudio,
    mediaError,
    changing,
    toggleMedia,
  } = useGroupRoom(room);
  const [minimized, setMinimized] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const connected = !reconnecting && state === ConnectionState.Connected;
  const video = call.media === 'video';
  const status = connected
    ? `${participants.length}/${MAX_GROUP_CALL_PARTICIPANTS} en la llamada`
    : reconnecting || state === ConnectionState.Reconnecting ||
        state === ConnectionState.SignalReconnecting
      ? 'Reconectando…'
      : tryingRelay
        ? 'Probando conexión por TURN…'
        : 'Conectando…';
  const description = `${video ? 'Videollamada grupal' : 'Llamada grupal'} · ${status}`;
  const MicIcon = microphoneEnabled ? Mic : MicOff;
  const CameraIcon = cameraEnabled ? Video : VideoOff;
  const actionClass =
    'flex items-center justify-center gap-2 rounded-lg bg-bg-chat px-3 py-2 text-sm font-medium enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

  const galleryColumns =
    participants.length === 1
      ? 'lg:mx-auto lg:w-full lg:max-w-3xl lg:grid-cols-1'
      : participants.length > 2
        ? 'lg:grid-cols-3'
        : '';

  return (
    <>
      {audio.map((track) => (
        <TrackAudio track={track} key={track.sid ?? track.mediaStreamTrack.id} />
      ))}
      {minimized ? (
        <button
          type='button'
          aria-label='Expandir llamada'
          className='fixed bottom-4 right-4 z-50 flex max-w-[calc(100%-2rem)] cursor-pointer items-center gap-3 rounded-2xl border border-border bg-bg-app p-3 text-left shadow-xl'
          onClick={() => setMinimized(false)}
        >
          <span className='min-w-0'>
            <span className='block truncate font-semibold'>{title}</span>
            <span className='block text-sm text-text-secondary'>{description}</span>
          </span>
          <ChevronUp size={20} />
        </button>
      ) : (
        <GroupCallDialog
          title={title}
          status={description}
          minimize={() => setMinimized(true)}
        >
          <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 lg:overflow-hidden'>
            {connected && (
              <ul
                className={`grid max-h-[44vh] grid-cols-2 gap-2 overflow-y-auto lg:min-h-0 lg:max-h-none lg:gap-4 ${galleryColumns}`}
              >
                {participants.map(
                  ({
                    identity,
                    name,
                    participant,
                    camera,
                    microphoneEnabled: hasMic,
                  }) => (
                    <li
                      key={identity}
                      className='relative grid min-h-24 place-items-center overflow-hidden rounded-lg bg-bg-chat lg:aspect-video'
                    >
                      {camera?.videoTrack && !camera.isMuted ? (
                        <div className='aspect-video w-full'>
                          <TrackVideo
                            track={camera.videoTrack}
                            local={participant.isLocal}
                          />
                        </div>
                      ) : (
                        <span
                          aria-hidden='true'
                          className='mb-6 grid size-9 place-items-center rounded-full bg-accent/15 font-semibold text-accent'
                        >
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div className='absolute inset-x-2 bottom-2 flex items-center gap-1 rounded bg-black/65 px-2 py-1 text-xs text-white'>
                        <span className='min-w-0 flex-1 truncate'>
                          {participant.isLocal ? 'Tú' : name}
                        </span>
                        {!hasMic && <MicOff size={12} aria-label='Micrófono apagado' />}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
            {connected && !canPlayAudio && (
              <button
                type='button'
                className={actionClass}
                onClick={() => {
                  setAudioError(false);
                  void room.startAudio().catch(() => setAudioError(true));
                }}
              >
                Activar sonido
              </button>
            )}
            {(mediaError || error || initialMediaError || audioError) && (
              <p role='alert' className='text-sm text-red-500'>
                {mediaError ||
                  error ||
                  initialMediaError ||
                  'No se pudo activar el sonido.'}
              </p>
            )}
            <div className='mt-auto flex shrink-0 flex-wrap justify-center gap-2'>
              <button
                type='button'
                className={actionClass}
                disabled={!connected || preparingMedia || changing || ending}
                aria-label={
                  microphoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'
                }
                onClick={() => void toggleMedia('microphone')}
              >
                <MicIcon size={18} />
              </button>
              {video && (
                <button
                  type='button'
                  className={actionClass}
                  disabled={!connected || preparingMedia || changing || ending}
                  aria-label={cameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
                  onClick={() => void toggleMedia('camera')}
                >
                  <CameraIcon size={18} />
                </button>
              )}
              <button
                type='button'
                className={`${actionClass} text-red-500`}
                onClick={leave}
                disabled={ending}
              >
                <PhoneOff size={16} /> Salir
              </button>
              {canEnd && (
                <button
                  type='button'
                  className={`${actionClass} text-red-500`}
                  disabled={ending}
                  onClick={() => {
                    if (window.confirm('¿Finalizar la llamada para todos?')) end();
                  }}
                >
                  {ending ? 'Finalizando…' : 'Finalizar para todos'}
                </button>
              )}
            </div>
          </div>
        </GroupCallDialog>
      )}
    </>
  );
}
