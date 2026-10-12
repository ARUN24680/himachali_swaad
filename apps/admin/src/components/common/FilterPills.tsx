import { ToggleGroup, ToggleGroupItem, cn } from '@pk/ui';

export interface PillOption<V extends string> {
  value: V;
  label: string;
  /** Badge count (e.g. orders in this tab). `undefined` while loading. */
  count?: number;
  /** Draw attention to a non-zero count (e.g. "Needs attention"). */
  alert?: boolean;
}

/**
 * Segmented status pills (left side of the Tier 3 controls bar). Radix ToggleGroup: arrow-key
 * roving focus, 44px targets; scrolls inside itself on narrow screens (never the page).
 */
export function FilterPills<V extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: readonly PillOption<V>[];
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      // Radix lets the active pill be "un-pressed" → ignore the empty value, a tab is always selected
      onValueChange={(v) => v && onChange(v as V)}
      className={cn(
        '-mx-1 w-auto max-w-[calc(100%+0.5rem)] min-w-0 gap-1.5 overflow-x-auto border-0 bg-transparent px-1 py-0.5 lg:mx-0 lg:max-w-full lg:flex-wrap lg:px-0',
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            'min-h-11 flex-none rounded-full border border-border px-3.5 whitespace-nowrap',
            'data-[state=on]:border-secondary data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground data-[state=on]:shadow-none data-[state=on]:ring-0',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                o.alert && o.count > 0 ? 'bg-destructive/15 text-destructive' : 'opacity-80',
              )}
            >
              {o.count}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
