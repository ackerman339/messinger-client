import { useEffect, useRef, useState } from 'react';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import type { Room } from 'livekit-client';

const events = [
  RoomEvent.ConnectionStateChanged,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.AudioPlaybackStatusChanged,
];

function snapshot(room: Room) {
  return {
    state: room.state,
    canPlayAudio: room.canPlaybackAudio,
    microphoneEnabled: room.localParticipant.isMicrophoneEnabled,
    cameraEnabled: room.localParticipant.isCameraEnabled,
    participants: [room.localParticipant, ...room.remoteParticipants.values()].map(
      (participant) => ({
        identity: participant.identity,
        name: participant.name?.trim() || (participant.isLocal ? 'Tú' : 'Participante'),
        participant,
        camera: participant.getTrackPublication(Track.Source.Camera),
        microphoneEnabled: participant.isMicrophoneEnabled,
      }),
    ),
    audio: [...room.remoteParticipants.values()].flatMap((participant) =>
      [...participant.audioTrackPublications.values()].flatMap(({ audioTrack }) =>
        audioTrack ? [audioTrack] : [],
      ),
    ),
  };
}

export function useGroupRoom(room: Room) {
  const [state, setState] = useState(() => snapshot(room));
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let mounted = true;
    const update = () => {
      if (mounted) setState(snapshot(room));
    };
    for (const event of events) room.on(event, update);
    queueMicrotask(update);
    return () => {
      mounted = false;
      for (const event of events) room.off(event, update);
    };
  }, [room]);

  async function toggleMedia(
    kind: 'microphone' | 'camera',
    beforeEnable?: (kind: 'microphone' | 'camera') => Promise<void>,
  ) {
    if (inFlight.current || room.state !== ConnectionState.Connected) return;
    inFlight.current = true;
    setChanging(true);
    setMediaError(null);
    const participant = room.localParticipant;
    const enabling =
      kind === 'microphone'
        ? !participant.isMicrophoneEnabled
        : !participant.isCameraEnabled;
    try {
      if (enabling) await beforeEnable?.(kind);
      if (room.state !== ConnectionState.Connected) return;
      if (kind === 'microphone') await participant.setMicrophoneEnabled(enabling);
      else await participant.setCameraEnabled(enabling);
    } catch {
      setMediaError(
        kind === 'microphone'
          ? 'No se pudo cambiar el micrófono. Verifica el permiso y vuelve a intentarlo.'
          : 'No se pudo cambiar la cámara. Verifica el permiso y vuelve a intentarlo.',
      );
    } finally {
      inFlight.current = false;
      setChanging(false);
    }
  }

  return { ...state, mediaError, changing, toggleMedia };
}
