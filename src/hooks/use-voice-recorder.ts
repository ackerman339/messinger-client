import { useRef, useState } from 'react';
import { getSupportedAudioMimeType } from '@lib/utils';

export function useVoiceRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const mimeType = getSupportedAudioMimeType();

    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());

      throw new Error('Audio recording is not supported');
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
    });

    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.start();

    streamRef.current = stream;
    mediaRecorderRef.current = recorder;

    setIsRecording(true);
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder) {
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType,
        });

        cleanup();

        resolve(blob);
      };

      recorder.stop();
    });
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    cleanup();
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    setIsRecording(false);
  }

  return {
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
