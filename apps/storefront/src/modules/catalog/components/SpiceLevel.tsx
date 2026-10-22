import { cn } from '@pk/ui';
import { Flame } from 'lucide-react';

const WORDS = ['', 'Mild', 'Gentle', 'Medium', 'Hot', 'Fiery'];

/**
 * 1–5 flames read as ONE image by screen readers ("Spice level 4 of 5, Hot"); the visible word is
 * optional. Empty flames use a faded foreground so the scale stays legible on light and dark cards.
 */
export function SpiceLevel({
  level,
  showWord = true,
  size = 'md',
  className,
}: {
  level: number;
  showWord?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const word = WORDS[level] ?? '';
  return (
    <span
      role="img"
      aria-label={`Spice level ${level} of 5${word ? `, ${word}` : ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 text-muted-foreground',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <Flame
            key={i}
            className={cn(
              size === 'sm' ? 'size-3.5' : 'size-4',
              i < level ? 'fill-tertiary/80 text-tertiary' : 'text-muted-foreground/35',
            )}
          />
        ))}
      </span>
      {showWord && (
        <span aria-hidden="true" className="font-medium">
          {word}
        </span>
      )}
    </span>
  );
}
