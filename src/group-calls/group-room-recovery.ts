import { isAxiosError } from 'axios';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import type { Participant, Room, TrackPublication } from 'livekit-client';
import { groupCallApi } from './api';
import type { GroupCallTarget } from './types';

const RETRY_DELAYS = [0, 1000, 2000, 4000, 8000, 8000];

export function trackGroupMedia(room: Room) {
  let microphone = false;
  let camera = false;
  function update(publication: TrackPublication, participant: Participant) {
    if (!participant.isLocal) return;
    if (publication.source === Track.Source.Microphone) microphone = !publication.isMuted;
    if (publication.source === Track.Source.Camera) camera = !publication.isMuted;
  }
  room.on(RoomEvent.LocalTrackPublished, update);
  room.on(RoomEvent.TrackMuted, update);
  room.on(RoomEvent.TrackUnmuted, update);
  return () => ({ microphone, camera });
}

function waitToRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted || !delay) {
      resolve();
      return;
    }
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    const timer = setTimeout(finish, delay);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function recoverGroupRoom(
  room: Room,
  call: GroupCallTarget,
  media: { microphone: boolean; camera: boolean },
  signal: AbortSignal,
  connect: (url: string, token: string) => Promise<void>,
) {
  let lastError: unknown;
  for (const delay of RETRY_DELAYS) {
    await waitToRetry(delay, signal);
    if (signal.aborted) return;
    try {
      const { url, token } = await groupCallApi.join(call, false, signal);
      if (signal.aborted) return;
      await connect(url, token);
      if (signal.aborted) return;
      const mediaResults = await Promise.allSettled([
        media.microphone && room.localParticipant.setMicrophoneEnabled(true),
        media.camera && room.localParticipant.setCameraEnabled(true),
      ]);
      if (signal.aborted) return;
      if (room.state === ConnectionState.Disconnected) {
        throw new Error('La conexión se interrumpió durante la reconexión.');
      }
      if (mediaResults.some((result) => result.status === 'rejected')) {
        return 'No se pudo restaurar el micrófono o la cámara.';
      }
      return;
    } catch (error) {
      if (signal.aborted) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403 || status === 404) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
