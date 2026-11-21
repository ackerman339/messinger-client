import { Copy, Forward, Trash2, X, Reply } from 'lucide-react';

type MessageSelectionBarProps = {
  count: number;
  isLoading: boolean;
  canCopy: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onForward?: () => void;
  onReply?: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function MessageSelectionBar({
  count,
  isLoading,
  canCopy,
  canDelete,
  onCopy,
  onForward,
  onReply,
  onDelete,
  onClose,
}: MessageSelectionBarProps) {
  return (
    <div className='absolute w-full lg:w-[calc(100vw-400px)] inset-x-0 top-0 lg:left-100 flex h-16 items-center justify-between border-t border-border bg-bg-app/95 px-4 shadow-lg backdrop-blur-sm'>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={onClose}
          className='rounded-full p-2 hover:bg-bg-hover cursor-pointer'
          aria-label='Cancelar selección'
        >
          <X size={20} />
        </button>

        <span className='text-sm font-medium'>
          {count}{' '}
          {count === 1 ? 'mensaje seleccionado' : 'mensajes seleccionados'}
        </span>
      </div>

      <div className='flex items-center gap-2'>
        {onReply && (
          <button type='button' disabled={isLoading} onClick={onReply} aria-label='Responder mensaje' title='Responder' className='cursor-pointer rounded-lg p-2 hover:bg-bg-chat'>
            <Reply size={20} />
          </button>
        )}
        {onForward && (
          <button type='button' disabled={isLoading} onClick={onForward} aria-label='Reenviar mensajes' title='Reenviar' className='cursor-pointer rounded-lg p-2 hover:bg-bg-chat'>
            <Forward size={20} />
          </button>
        )}
        {canCopy && (
          <button
            type='button'
            disabled={isLoading}
            onClick={onCopy}
            aria-label='Copiar texto'
            className='flex items-center gap-2 rounded-lg p-2 hover:bg-bg-hover cursor-pointer'
          >
            <Copy size={20} />
            <span className='hidden sm:inline'>Copiar</span>
          </button>
        )}
        {canDelete && (
          <button
            type='button'
            disabled={isLoading}
            onClick={onDelete}
            aria-label='Eliminar mensajes'
            className='flex items-center gap-2 rounded-lg px-3 py-2 text-red-500 hover:bg-red-500/10 cursor-pointer disabled:text-gray-500'
          >
            <Trash2 size={20} />
            <span className='hidden sm:inline'>Eliminar</span>
          </button>
        )}
      </div>
    </div>
  );
}
