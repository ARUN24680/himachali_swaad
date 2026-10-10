import { cn } from './lib/utils';

/**
 * FSSAI non-vegetarian symbol: brown filled circle inside a brown-outlined square (Rules §4.2).
 * The ONLY way to render the mark — never redraw it elsewhere.
 */
const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5', xl: 'size-6' } as const;

export function NonVegMark({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Non-vegetarian"
      title="Non-vegetarian"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-[2px] border-[1.5px] border-nonveg bg-card',
        SIZES[size],
        className,
      )}
    >
      <span className="size-[45%] rounded-full bg-nonveg" />
    </span>
  );
}
