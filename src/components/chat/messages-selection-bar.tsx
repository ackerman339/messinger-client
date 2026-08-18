import { Trash2, X } from 'lucide-react';

type MessageSelectionBarProps = {
  count: number;
  isLoading: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function MessageSelectionBar({
  count,
  isLoading,
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
          {count} {count === 1 ? 'mensaje seleccionado' : 'mensajes seleccionados'}
        </span>
      </div>

      <button
        type='button'
        disabled={isLoading}
        onClick={onDelete}
        className='flex items-center gap-2 rounded-lg px-3 py-2 text-red-500 hover:bg-red-500/10 cursor-pointer disabled:text-gray-500'
      >
        <Trash2 size={20} />
        <span>Eliminar</span>
      </button>
    </div>
  );
}
