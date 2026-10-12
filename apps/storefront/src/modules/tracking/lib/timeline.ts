import type { TimelineEntry, TimelineKey, TrackResponse } from '@pk/shared';
import { formatDay } from './format';

export type JourneyState = 'done' | 'current' | 'upcoming';

export interface JourneyNode {
  id: string;
  key: TimelineKey;
  label: string;
  /** null for upcoming milestones. */
  at: string | null;
  detail: string | null;
  tone: TimelineEntry['tone'];
  state: JourneyState;
  /** Earlier courier scans folded into this in-transit node (newest last). */
  earlier: { at: string; detail: string | null }[];
}

/** Happy-path milestones, used to show what is still ahead while the parcel is moving. */
const MILESTONES: { key: TimelineKey; label: string }[] = [
  { key: 'CONFIRMED', label: 'Order confirmed' },
  { key: 'PACKED', label: 'Airtight packed & sealed' },
  { key: 'HANDED_TO_COURIER', label: 'Handed to courier' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
];

/** Where each entry sits on the milestone line (BOTTLED is before the order exists). */
const LEVEL: Partial<Record<TimelineKey, number>> = {
  BOTTLED: -1,
  CONFIRMED: 0,
  PACKED: 1,
  HANDED_TO_COURIER: 2,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERY_FAILED: 3,
  DELIVERED: 4,
};

/** Once one of these appears the journey has ended — nothing "upcoming" is drawn. */
const TERMINAL: ReadonlySet<TimelineKey> = new Set(['DELIVERED', 'RTO', 'CANCELLED', 'REFUND']);

/**
 * Server timeline (time-sorted, Phase 8 §8.1) → stepper nodes:
 * 1. consecutive courier scans fold into one "In transit" node (latest hub on top, earlier scans listed),
 *    so a long trip doesn't push the horizontal stepper off-screen;
 * 2. the latest real event is `current`;
 * 3. while the order is still moving, the remaining milestones are appended as `upcoming`
 *    (Delivered carries the courier ETD).
 */
export function buildJourney(order: Pick<TrackResponse, 'timeline' | 'etd'>): JourneyNode[] {
  const nodes: JourneyNode[] = [];
  order.timeline.forEach((entry, i) => {
    const prev = nodes.at(-1);
    if (entry.key === 'IN_TRANSIT' && prev?.key === 'IN_TRANSIT' && prev.at) {
      prev.earlier.push({ at: prev.at, detail: prev.detail });
      prev.at = entry.at;
      prev.detail = entry.detail;
      prev.label = entry.label;
      prev.tone = entry.tone;
      return;
    }
    nodes.push({
      id: `${entry.key}-${i}`,
      key: entry.key,
      label: entry.label,
      at: entry.at,
      detail: entry.detail,
      tone: entry.tone,
      state: 'done',
      earlier: [],
    });
  });

  const last = nodes.at(-1);
  if (last) last.state = 'current';

  if (nodes.some((n) => TERMINAL.has(n.key))) return nodes;
  const reached = Math.max(-1, ...nodes.map((n) => LEVEL[n.key] ?? -1));
  for (const m of MILESTONES.slice(reached + 1)) {
    nodes.push({
      id: `upcoming-${m.key}`,
      key: m.key,
      label: m.label,
      at: null,
      detail: m.key === 'DELIVERED' && order.etd ? `Expected by ${formatDay(order.etd, { weekday: true })}` : null,
      tone: 'neutral',
      state: 'upcoming',
      earlier: [],
    });
  }
  return nodes;
}
