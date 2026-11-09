import type { ComponentPropsWithoutRef } from 'react';

type CallControlProps = Omit<ComponentPropsWithoutRef<'button'>, 'className'> & {
  caption: string;
  variant?: 'neutral' | 'accept' | 'end';
};

const variants = {
  neutral:
    'bg-bg-chat text-text-primary enabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-bg-app))] group-data-[video=true]/call:bg-text-primary/65 group-data-[video=true]/call:text-bg-app group-data-[video=true]/call:enabled:hover:text-accent-ink aria-pressed:bg-accent aria-pressed:text-accent-ink aria-pressed:enabled:hover:bg-accent',
  accept: 'bg-accent text-accent-ink enabled:hover:bg-accent-hover',
  end: 'bg-danger text-bg-app enabled:hover:bg-danger-hover',
};

/** Shared presentation for call controls; actions and state come from the panel model. */
export function CallControl({
  caption,
  variant = 'neutral',
  children,
  ...props
}: CallControlProps) {
  return (
    <div className='grid min-w-[68px] justify-items-center gap-[11px] group-data-[media=true]/controls:min-w-0'>
      <button
        {...props}
        type='button'
        className={`grid size-16 cursor-pointer place-items-center rounded-full border-0 transition-[background,transform] duration-200 enabled:hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none group-data-[media=true]/controls:size-[clamp(44px,12vw,56px)] ${variants[variant]}`}
      >
        {children}
      </button>
      <span className='text-xs text-text-secondary group-data-[video=true]/call:text-bg-app/80'>
        {caption}
      </span>
    </div>
  );
}
