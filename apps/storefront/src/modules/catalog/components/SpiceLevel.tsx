import { cn } from '@pk/ui';
import { Flame } from 'lucide-react';

const WORDS = ['', 'Mild', 'Gentle', 'Medium', 'Hot', 'Fiery'];

/** 1–5 flames; the text label carries the meaning, the icons are decorative. */
export function SpiceLevel({
  level,
  showWord = true,
  className,
}: {
  level: number;
  showWord?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <span aria-hidden="true" className="inline-flex">
        {Array.from({ length: 5 }, (_, i) => (
          <Flame key={i} className={cn('size-3.5', i < level ? 'fill-tertiary/80 text-tertiary' : 'text-border')} />
        ))}
      </span>
      <span className="sr-only">Spice level {level} of 5</span>
      {showWord && <span aria-hidden="true">{WORDS[level] ?? ''}</span>}
    </span>
  );
}
