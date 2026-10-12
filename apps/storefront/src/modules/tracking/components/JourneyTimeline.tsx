'use client';

import type { TimelineKey, TrackResponse } from '@pk/shared';
import { cn } from '@pk/ui';
import {
  Bike,
  CircleCheck,
  CircleX,
  House,
  MapPin,
  Mountain,
  PackageCheck,
  RotateCcw,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { formatDay, formatWhen } from '../lib/format';
import { buildJourney, type JourneyNode } from '../lib/timeline';

const ICON: Record<TimelineKey, LucideIcon> = {
  BOTTLED: Mountain,
  CONFIRMED: CircleCheck,
  PACKED: PackageCheck,
  HANDED_TO_COURIER: Truck,
  IN_TRANSIT: MapPin,
  OUT_FOR_DELIVERY: Bike,
  DELIVERED: House,
  DELIVERY_FAILED: TriangleAlert,
  RTO: Undo2,
  CANCELLED: CircleX,
  REFUND: RotateCcw,
};

/** Tone → token classes (Rules §1.4 status pattern). Literal strings so Tailwind sees them. */
const MEDALLION: Record<JourneyNode['tone'], string> = {
  success: 'border-success/30 bg-success/15 text-success',
  info: 'border-info/30 bg-info/15 text-info',
  warning: 'border-warning/30 bg-warning/15 text-warning',
  destructive: 'border-destructive/30 bg-destructive/15 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
};
const HALO: Record<JourneyNode['tone'], string> = {
  success: 'ring-success/20',
  info: 'ring-info/20',
  warning: 'ring-warning/20',
  destructive: 'ring-destructive/20',
  neutral: 'ring-ring/20',
};

const STATE_SR: Record<JourneyNode['state'], string> = {
  done: 'Completed',
  current: 'Latest update',
  upcoming: 'Coming up',
};

/**
 * The parcel's story, kitchen → doorstep (Phase 8 §8.2): a vertical stepper on phones/tablets, a
 * horizontal one from `lg`. Shared by /track and /account/orders/[orderCode] (§8.3). If a long trip
 * is wider than the card, the list scrolls inside its own container (never the page) and starts
 * scrolled to the latest update.
 */
export function JourneyTimeline({
  order,
  className,
}: {
  order: Pick<TrackResponse, 'timeline' | 'etd'>;
  className?: string;
}) {
  const nodes = useMemo(() => buildJourney(order), [order]);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const current = list.querySelector<HTMLElement>('[data-state="current"]');
    if (current) list.scrollLeft = Math.max(0, current.offsetLeft - list.clientWidth / 2);
  }, [nodes]);

  if (nodes.length === 0) return null;

  return (
    <ol
      ref={listRef}
      className={cn(
        'relative grid lg:flex lg:snap-x lg:overflow-x-auto lg:overscroll-x-contain lg:pt-1 lg:pb-3',
        className,
      )}
      data-testid="journey-timeline"
    >
      {nodes.map((node, i) => {
        const Icon = ICON[node.key];
        const next = nodes[i + 1];
        const upcoming = node.state === 'upcoming';
        return (
          <li
            key={node.id}
            data-state={node.state}
            data-key={node.key}
            data-testid="journey-step"
            aria-current={node.state === 'current' ? 'step' : undefined}
            className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 pb-7 last:pb-0 lg:flex lg:min-w-32 lg:flex-1 lg:basis-0 lg:snap-start lg:flex-col lg:gap-3 lg:pr-3 lg:pb-0"
          >
            {next && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-11 bottom-1 left-5 w-0.5 -translate-x-1/2 rounded-full',
                  'lg:top-5 lg:right-1 lg:bottom-auto lg:left-12 lg:h-0.5 lg:w-auto lg:translate-x-0 lg:-translate-y-1/2',
                  next.state === 'upcoming' ? 'bg-border' : 'bg-muted-foreground/40',
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative grid size-10 shrink-0 place-items-center rounded-full border [&_svg]:size-4.5',
                upcoming ? 'border-dashed border-input bg-card text-muted-foreground' : MEDALLION[node.tone],
                node.state === 'current' && cn('ring-4', HALO[node.tone]),
              )}
            >
              <Icon />
            </span>
            <div className="grid min-w-0 content-start gap-1 pt-1.5 lg:pt-0">
              <p
                className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug font-medium',
                  upcoming ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                <span className="sr-only">{STATE_SR[node.state]}: </span>
                {node.label}
                {node.state === 'current' && (
                  <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-accent-foreground uppercase">
                    Latest
                  </span>
                )}
              </p>
              {node.at && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  <time dateTime={node.at}>{node.key === 'BOTTLED' ? formatDay(node.at) : formatWhen(node.at)}</time>
                </p>
              )}
              {node.detail && (
                <p
                  className={cn(
                    'text-sm text-pretty break-words',
                    node.key === 'BOTTLED' ? 'font-mono text-xs text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {node.key === 'BOTTLED' ? `Batch ${node.detail}` : node.detail}
                </p>
              )}
              {node.earlier.length > 0 && <EarlierScans scans={node.earlier} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EarlierScans({ scans }: { scans: JourneyNode['earlier'] }) {
  return (
    <details className="group mt-0.5 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9">
        {scans.length} earlier {scans.length === 1 ? 'scan' : 'scans'}
      </summary>
      <ul className="mt-1 grid gap-1.5 border-l-2 border-border pl-3">
        {[...scans].reverse().map((s) => (
          <li key={s.at} className="grid text-muted-foreground">
            <span className="text-foreground">{s.detail ?? 'In transit'}</span>
            <time dateTime={s.at} className="text-xs tabular-nums">
              {formatWhen(s.at)}
            </time>
          </li>
        ))}
      </ul>
    </details>
  );
}
