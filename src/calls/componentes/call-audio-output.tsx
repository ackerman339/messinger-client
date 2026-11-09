import { Ear, Volume2 } from 'lucide-react';
import { CallControl } from './call-control';
import type { CallAudioOutputModel } from '@hooks/use-call-audio-output';

export function CallAudioOutput({ output }: { output: CallAudioOutputModel }) {
  if (!output.canToggle) return null;
  const speaker = output.route === 'speaker';

  return (
    <CallControl
      caption={speaker ? 'Altavoz' : 'Auricular'}
      aria-label={speaker ? 'Usar auricular interno' : 'Usar altavoz'}
      aria-pressed={speaker}
      aria-busy={output.busy}
      disabled={output.busy}
      onClick={() => {
        void output.toggle();
      }}
    >
      {speaker ? <Volume2 size={25} /> : <Ear size={25} />}
    </CallControl>
  );
}
