import { Input, cn } from '@pk/ui';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Search box for the Tier 3 controls bar (right side). Keeps its own text and reports it after a
 * short pause, so typing doesn't fire a request per key; an outside reset (URL change) wins.
 */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  className,
  delayMs = 300,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  delayMs?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // URL / parent changed the value (back button, "clear filters") → show it (render-time sync)
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => report.current(text), delayMs);
    return () => window.clearTimeout(t);
  }, [text, value, delayMs]);

  return (
    <div className={cn('relative w-full min-w-0 lg:w-80', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text !== value) onChange(text);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('');
            if (value !== '') onChange('');
          }}
          className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
