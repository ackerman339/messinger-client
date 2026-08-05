export function getSupportedAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

  return types.find((type) => MediaRecorder.isTypeSupported(type));
}
