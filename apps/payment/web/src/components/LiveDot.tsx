import { cn } from '@pk/ui';

/** Small pulsing "live" indicator (decorative). */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-2.5 shrink-0', className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2.5 rounded-full bg-success" />
    </span>
  );
}
