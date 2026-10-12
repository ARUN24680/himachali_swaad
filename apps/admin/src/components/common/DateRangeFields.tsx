import { Input, cn } from '@pk/ui';
import { useId } from 'react';

/** From / to IST calendar days ('YYYY-MM-DD') for list filters and exports. */
export function DateRangeFields({
  from,
  to,
  onChange,
  className,
  labelPrefix = '',
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
  labelPrefix?: string;
}) {
  const ids = { from: useId(), to: useId() };
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:flex sm:items-center', className)}>
      <label htmlFor={ids.from} className="sr-only">
        {labelPrefix}From date
      </label>
      <Input
        id={ids.from}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="min-w-0 sm:w-40"
      />
      <label htmlFor={ids.to} className="sr-only">
        {labelPrefix}To date
      </label>
      <Input
        id={ids.to}
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="min-w-0 sm:w-40"
      />
    </div>
  );
}
