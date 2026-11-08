import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X } from 'lucide-react';
import type { CallPanelModel } from '@hooks/use-call-panel';

export function CallControls({ model }: { model: CallPanelModel }) {
  const { call, terminal } = model;
  if (!call) return null;

  return (
    <div className='call-controls'>
      {model.canAccept && (
        <>
          <div className='call-control-group'>
            <button
              type='button'
              className='call-control call-control--end'
              aria-label='Rechazar llamada'
              onClick={model.reject}
            >
              <PhoneOff size={28} />
            </button>
            <span>Rechazar</span>
          </div>
          <div className='call-control-group'>
            <button
              type='button'
              className='call-control call-control--accept'
              aria-label='Aceptar llamada'
              onClick={model.accept}
            >
              {call.media === 'video' ? <Video size={28} /> : <Phone size={28} />}
            </button>
            <span>Aceptar</span>
          </div>
        </>
      )}
      {model.canControlMedia && (
        <>
          <div className='call-control-group'>
            <button
              type='button'
              className='call-control'
              aria-pressed={call.muted}
              aria-label={call.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
              onClick={model.toggleMicrophone}
            >
              {call.muted ? <MicOff size={25} /> : <Mic size={25} />}
            </button>
            <span>{call.muted ? 'Silenciado' : 'Micrófono'}</span>
          </div>
          {call.media === 'video' && (
            <div className='call-control-group'>
              <button
                type='button'
                className='call-control'
                aria-pressed={call.cameraOff}
                aria-label={call.cameraOff ? 'Activar cámara' : 'Apagar cámara'}
                onClick={model.toggleCamera}
              >
                {call.cameraOff ? <VideoOff size={25} /> : <Video size={25} />}
              </button>
              <span>Cámara</span>
            </div>
          )}
        </>
      )}
      {model.canEnd && (
        <div className='call-control-group'>
          <button
            type='button'
            className='call-control call-control--end'
            aria-label='Finalizar llamada'
            onClick={model.end}
          >
            <PhoneOff size={28} />
          </button>
          <span>
            {call.status === 'ringing' || call.status === 'requesting' ? 'Cancelar' : 'Finalizar'}
          </span>
        </div>
      )}
      {terminal && (
        <div className='call-control-group'>
          <button
            type='button'
            className='call-control'
            aria-label='Cerrar llamada'
            onClick={model.dismiss}
          >
            <X size={27} />
          </button>
          <span>Cerrar</span>
        </div>
      )}
    </div>
  );
}
