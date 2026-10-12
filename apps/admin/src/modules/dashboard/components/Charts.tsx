import { formatINR, type AdminDashboardResponse } from '@pk/shared';
import { cn } from '@pk/ui';
import { useState } from 'react';
import { formatShortDate } from '@/lib/dates';

type Day = AdminDashboardResponse['ordersPerDay'][number];

const compactINR = (paise: number) => formatINR(Math.round(paise / 100) * 100, { trimZeroPaise: true });

/**
 * Single-series daily column chart (hand-rolled SVG, token fills — no chart library). Bars have a
 * 2px gap and rounded tops; hovering / focusing a day shows its numbers in the readout line above.
 * An sr-only table carries the same data for screen readers.
 */
export function DailyBars({ days, metric }: { days: Day[]; metric: 'orders' | 'revenue' }) {
  const [active, setActive] = useState<number | null>(null);
  const value = (d: Day) => (metric === 'orders' ? d.orders : d.grossPaise);
  const fmt = (d: Day) =>
    metric === 'orders' ? `${d.orders} order${d.orders === 1 ? '' : 's'}` : formatINR(d.grossPaise);
  const max = Math.max(1, ...days.map(value));
  const total = days.reduce((n, d) => n + value(d), 0);
  const W = 10; // viewBox units per day
  const H = 100;
  const shown = active != null ? days[active] : undefined;

  return (
    <figure className="grid gap-3 px-5 py-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm" aria-live="polite">
        {shown ? (
          <span>
            <span className="font-medium">{formatShortDate(shown.date)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {shown.orders} order{shown.orders === 1 ? '' : 's'} · {formatINR(shown.grossPaise)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Last {days.length} days ·{' '}
            <span className="font-medium text-foreground tabular-nums">
              {metric === 'orders' ? `${total} orders` : formatINR(total)}
            </span>
            {metric === 'revenue' && ' incl. GST'}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          peak {metric === 'orders' ? max : compactINR(max)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${days.length * W} ${H}`}
        preserveAspectRatio="none"
        className="h-48 w-full md:h-56"
        role="img"
        aria-label={`${metric === 'orders' ? 'Orders' : 'Revenue'} per day for the last ${days.length} days`}
        onMouseLeave={() => setActive(null)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={days.length * W}
            y1={H * f}
            y2={H * f}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {days.map((d, i) => {
          const h = value(d) === 0 ? 0 : Math.max(1.5, (value(d) / max) * (H - 4));
          return (
            <g key={d.date} onMouseEnter={() => setActive(i)}>
              {/* Hit target taller than the mark */}
              <rect x={i * W} y={0} width={W} height={H} className="fill-transparent" />
              <rect
                x={i * W + 1}
                y={H - h}
                width={W - 2}
                height={h}
                rx={1.2}
                className={cn('transition-colors', active === i ? 'fill-accent-foreground' : 'fill-primary')}
              >
                <title>{`${formatShortDate(d.date)}: ${fmt(d)}`}</title>
              </rect>
            </g>
          );
        })}
        <line
          x1={0}
          x2={days.length * W}
          y1={H}
          y2={H}
          className="stroke-input"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {days.length > 0 && (
        <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatShortDate(days[0]!.date)}</span>
          <span>{formatShortDate(days[Math.floor(days.length / 2)]!.date)}</span>
          <span>{formatShortDate(days[days.length - 1]!.date)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{metric === 'orders' ? 'Orders per day' : 'Revenue per day (incl. GST)'}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{metric === 'orders' ? 'Orders' : 'Revenue'}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{formatShortDate(d.date)}</td>
              <td>{fmt(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type ProductRow = AdminDashboardResponse['revenueByProduct'][number];

/** Ranked horizontal bars: product → revenue (incl. GST) + jars, value labels in text ink. */
export function ProductBars({ rows }: { rows: ProductRow[] }) {
  const sorted = [...rows].sort((a, b) => b.grossPaise - a.grossPaise);
  const max = Math.max(1, ...sorted.map((r) => r.grossPaise));
  const total = sorted.reduce((n, r) => n + r.grossPaise, 0);
  return (
    <ul aria-label="Revenue by product, this month" className="grid gap-4 px-5 py-5">
      {sorted.map((r) => {
        const pct = (r.grossPaise / max) * 100;
        const share = total ? Math.round((r.grossPaise / total) * 100) : 0;
        return (
          <li key={r.title} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="min-w-0 font-medium">{r.title}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{formatINR(r.grossPaise)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {r.jars} jar{r.jars === 1 ? '' : 's'} · {share}%
                </span>
              </span>
            </div>
            <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" className="h-2.5 w-full">
              <rect x={0} y={0} width={100} height={6} rx={1.5} className="fill-muted" />
              <rect x={0} y={0} width={Math.max(pct, 1)} height={6} rx={1.5} className="fill-primary" />
            </svg>
          </li>
        );
      })}
    </ul>
  );
}
