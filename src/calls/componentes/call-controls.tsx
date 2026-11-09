import { Mic, MicOff, SwitchCamera, Phone, PhoneOff, Video, VideoOff, X } from 'lucide-react';
import { CallAudioOutput } from './call-audio-output';
import { CallControl } from './call-control';

import type { CallPanelModel } from '@hooks/use-call-panel';

export function CallControls({ model }: { model: CallPanelModel }) {
  const { call, terminal } = model;
  if (!call) return null;

  return (
    <div
      data-media={model.canControlMedia}
      className='group/controls flex items-start justify-center gap-7 data-[media=true]:grid data-[media=true]:auto-cols-fr data-[media=true]:grid-flow-col data-[media=true]:gap-2.5'
    >
      {model.canAccept && (
        <>
          <CallControl
            caption='Rechazar'
            variant='end'
            aria-label='Rechazar llamada'
            onClick={model.reject}
          >
            <PhoneOff size={28} />
          </CallControl>
          <CallControl
            caption='Aceptar'
            variant='accept'
            aria-label='Aceptar llamada'
            onClick={model.accept}
          >
            {call.media === 'video' ? <Video size={28} /> : <Phone size={28} />}
          </CallControl>
        </>
      )}
      {model.canControlMedia && (
        <>
          <CallAudioOutput output={model.audioOutput} />
          <CallControl
            caption={call.muted ? 'Silenciado' : 'Micrófono'}
            aria-pressed={call.muted}
            aria-label={call.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            onClick={model.toggleMicrophone}
          >
            {call.muted ? <MicOff size={25} /> : <Mic size={25} />}
          </CallControl>
          {call.media === 'video' && (
            <>
              <CallControl
                caption='Cámara'
                aria-pressed={call.cameraOff}
                aria-label={call.cameraOff ? 'Activar cámara' : 'Apagar cámara'}
                disabled={call.switchingCamera}
                onClick={model.toggleCamera}
              >
                {call.cameraOff ? <VideoOff size={25} /> : <Video size={25} />}
              </CallControl>
              <CallControl
                caption={call.switchingCamera ? 'Cambiando…' : 'Girar cámara'}
                aria-label='Cambiar cámara'
                disabled={call.switchingCamera}
                aria-busy={call.switchingCamera}
                onClick={model.switchCamera}
              >
                <SwitchCamera size={25} />
              </CallControl>
            </>
          )}
        </>
      )}
      {model.canEnd && (
        <CallControl
          caption={
            call.status === 'ringing' || call.status === 'requesting' ? 'Cancelar' : 'Finalizar'
          }
          variant='end'
          aria-label='Finalizar llamada'
          onClick={model.end}
        >
          <PhoneOff size={28} />
        </CallControl>
      )}
      {terminal && (
        <CallControl caption='Cerrar' aria-label='Cerrar llamada' onClick={model.dismiss}>
          <X size={27} />
        </CallControl>
      )}
    </div>
  );
}
