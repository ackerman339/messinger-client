import { useEffect, useState, useSyncExternalStore } from 'react';
import { createCallAudioOutput } from '@services/call-audio-output';

export function useCallAudioOutput(active: boolean, local?: MediaStream) {
  const [output] = useState(createCallAudioOutput);
  const snapshot = useSyncExternalStore(output.subscribe, output.getSnapshot);

  useEffect(() => {
    if (active) return output.start();
  }, [active, output]);

  // Microphone permission exposes the permitted device labels after media is acquired.
  useEffect(() => {
    if (active && local) void output.refresh();
  }, [active, local, output]);

  return { ...snapshot, attach: output.attach, toggle: output.toggle };
}

export type CallAudioOutputModel = ReturnType<typeof useCallAudioOutput>;
