import type { LocalTrack, Room } from 'livekit-client';

type MediaKind = 'microphone' | 'camera';

function mediaError(failed: string[]) {
  if (failed.length)
    return `No se pudo activar ${failed.join(' ni ')}. Revisa los permisos y vuelve a intentarlo.`;
}

// A browser permission prompt cannot be aborted. Let the call close while it is open
// and stop any track the browser grants after cancellation.
function captureTrack(request: () => Promise<LocalTrack>, signal: AbortSignal) {
  return new Promise<LocalTrack | undefined>((resolve, reject) => {
    const cancel = () => resolve(undefined);
    signal.addEventListener('abort', cancel, { once: true });
    void request().then(
      (track) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) {
          track.stop();
          return;
        }
        resolve(track);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
  });
}

export async function prepareGroupMedia(video: boolean, signal: AbortSignal) {
  const { createLocalAudioTrack, createLocalVideoTrack } = await import('livekit-client');
  const devices: MediaKind[] = video ? ['microphone', 'camera'] : ['microphone'];
  const tracks: LocalTrack[] = [];
  const failed: string[] = [];

  for (const device of devices) {
    if (signal.aborted) break;
    try {
      const track = await captureTrack(
        device === 'microphone' ? createLocalAudioTrack : createLocalVideoTrack,
        signal,
      );
      if (track) tracks.push(track);
    } catch {
      failed.push(device === 'microphone' ? 'el micrófono' : 'la cámara');
    }
  }

  return { tracks, failed };
}

export async function publishGroupMedia(
  room: Room,
  { tracks, failed }: Awaited<ReturnType<typeof prepareGroupMedia>>,
  signal: AbortSignal,
) {
  for (const track of tracks) {
    if (signal.aborted) return;
    try {
      await room.localParticipant.publishTrack(track);
    } catch {
      track.stop();
      failed.push(track.kind === 'audio' ? 'el micrófono' : 'la cámara');
    }
  }
  return mediaError(failed);
}
