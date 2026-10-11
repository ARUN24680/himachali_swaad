'use client';

import { cn } from '@pk/ui';
import { Minus, Plus } from 'lucide-react';

/** − qty + control with 44px targets. The label names the item so screen readers say what changes. */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  itemLabel,
  size = 'md',
  disabled = false,
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  itemLabel: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}) {
  const btn =
    'inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100 [&_svg]:size-4';
  return (
    <div
      role="group"
      aria-label={`Quantity for ${itemLabel}`}
      className={cn(
        'inline-flex items-center rounded-lg border border-input bg-background',
        size === 'sm' && 'h-11',
        size === 'md' && 'h-12',
        className,
      )}
    >
      <button
        type="button"
        className={btn}
        aria-label={`Decrease quantity of ${itemLabel}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        aria-label={`Increase quantity of ${itemLabel}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
