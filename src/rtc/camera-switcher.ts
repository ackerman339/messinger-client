interface CameraSwitchOptions {
  peer: RTCPeerConnection;
  stream: MediaStream;
  isActive: () => boolean;
  onChange: () => void;
  onUnavailable: () => void;
}

/** Replaces only the video sender; the microphone and call negotiation stay active. */
export async function replaceCamera({
  peer,
  stream,
  isActive,
  onChange,
  onUnavailable,
}: CameraSwitchOptions) {
  const previous = stream.getVideoTracks()[0];
  const sender = peer.getSenders().find((sender) => sender.track === previous);
  if (!previous || !sender) throw new Error('La cámara todavía no está lista.');

  const settings = previous.getSettings();
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === 'videoinput' && device.deviceId,
  );
  if (!isActive()) return;
  // Phones expose facingMode; computers usually expose separate camera device IDs.
  const facing = settings.facingMode === 'environment' ? 'user' : 'environment';
  const next =
    cameras[
      (cameras.findIndex((camera) => camera.deviceId === settings.deviceId) + 1) % cameras.length
    ];
  let target: MediaTrackConstraints = settings.facingMode
    ? { facingMode: { exact: facing } }
    : next && next.deviceId !== settings.deviceId && cameras.length > 1
      ? { deviceId: { exact: next.deviceId } }
      : {};
  if (!target.deviceId && !target.facingMode) throw new Error('No hay otra cámara disponible.');

  const capture = async (video: MediaTrackConstraints) => {
    const captured = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    const track = captured.getVideoTracks()[0];
    captured
      .getTracks()
      .filter((item) => item !== track)
      .forEach((item) => item.stop());
    if (!isActive() || !track) {
      track?.stop();
      if (!isActive()) return;
      throw new Error('No se pudo abrir la cámara.');
    }
    return track;
  };

  const install = async (track: MediaStreamTrack) => {
    try {
      track.enabled = previous.enabled;
      await sender.replaceTrack(track);
      if (!isActive()) {
        track.stop();
        return;
      }
      previous.onended = null;
      previous.stop();
      stream.removeTrack(previous);
      stream.addTrack(track);
      track.onended = () => {
        if (isActive()) onUnavailable();
      };
      onChange();
    } catch (error) {
      track.stop();
      throw error;
    }
  };

  async function captureNext() {
    try {
      return await capture(target);
    } catch (error) {
      // Desktop webcams may all report "user"; cycle their IDs if no rear camera exists.
      if (
        !(error instanceof DOMException) ||
        error.name !== 'OverconstrainedError' ||
        !target.facingMode ||
        !next ||
        cameras.length < 2 ||
        next.deviceId === settings.deviceId
      )
        throw error;
      target = { deviceId: { exact: next.deviceId } };
      return capture(target);
    }
  }

  let released = false;
  try {
    let replacement: MediaStreamTrack | undefined;
    try {
      replacement = await captureNext();
    } catch (error) {
      // Some cameras cannot be opened while another one is capturing.
      if (!isActive() || !(error instanceof DOMException) || error.name !== 'NotReadableError')
        throw error;
      previous.onended = null;
      previous.stop();
      released = true;
      replacement = await capture(target);
    }
    if (replacement) await install(replacement);
  } catch (error) {
    // Restore the previous camera if it had to be released before acquiring the next one.
    if (released && isActive()) {
      try {
        const restored = await capture(
          settings.deviceId
            ? { deviceId: { exact: settings.deviceId } }
            : { facingMode: { exact: settings.facingMode ?? 'user' } },
        );
        if (restored) await install(restored);
      } catch {
        if (isActive()) onUnavailable();
      }
    }
    throw error;
  }
}

export function getCameraSwitchError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Permite el acceso a la cámara para poder cambiarla.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No hay otra cámara disponible.';
      case 'NotReadableError':
        return 'No se pudo abrir la cámara. Revisa si otra aplicación la está usando.';
      case 'InvalidModificationError':
        return 'La otra cámara no es compatible con esta llamada.';
    }
  }
  return error instanceof Error ? error.message : 'No se pudo cambiar de cámara.';
}
