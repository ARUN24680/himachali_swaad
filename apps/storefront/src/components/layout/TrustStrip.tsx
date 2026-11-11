import { NonVegMark, cn } from '@pk/ui';
import { BadgeCheck, Landmark, Leaf, MapPin, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { origin, seller } from '@/config/site';

/**
 * Permanent trust strip (audit 2026-11-03 §3.3, R-7): the compliance facts a food buyer checks before
 * paying — FSSAI licence, GSTIN, origin, no preservatives, prepaid-only payment and the non-veg mark.
 * Values come from `seller`; an unset identifier shows a visible "Pending" marker, never a made-up
 * number. Phones get a horizontal scroll-snap rail of content-sized cards (no truncation, no page
 * overflow); from `lg` it becomes a six-up grid whose values wrap instead of being clipped. Server component.
 */
export function TrustStrip({ className }: { className?: string }) {
  return (
    <section
      aria-label="Trust and compliance"
      className={cn('border-t border-border bg-card', className)}
      data-testid="trust-strip"
    >
      <ul className="mx-auto flex max-w-6xl snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 py-4 md:px-8 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:py-5 [&::-webkit-scrollbar]:hidden">
        <Fact icon={<BadgeCheck />} term="FSSAI Lic. No.">
          <PendingValue value={seller.fssaiLicenseNo} label="FSSAI licence number">
            {(v) => <span className="tabular-nums">{v}</span>}
          </PendingValue>
        </Fact>
        <Fact icon={<Landmark />} term="GSTIN">
          <PendingValue value={seller.gstin} label="GSTIN">
            {(v) => <span className="tabular-nums">{v}</span>}
          </PendingValue>
        </Fact>
        <Fact icon={<MapPin />} term="Made in">
          {origin.place}
        </Fact>
        <Fact icon={<Leaf />} term="In the jar">
          No added preservatives
        </Fact>
        <Fact icon={<ShieldCheck />} term="Payment">
          Prepaid only · UPI, cards, netbanking
        </Fact>
        <Fact icon={<NonVegMark size="md" />} term="Food type">
          100% non-vegetarian
        </Fact>
      </ul>
    </section>
  );
}

function Fact({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <li className="flex shrink-0 snap-start items-center gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-3 lg:min-w-0 lg:px-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-4.5"
      >
        {icon}
      </span>
      <span className="grid min-w-0 gap-0.5 text-sm">
        <span className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{term}</span>
        <span className="font-medium whitespace-nowrap text-foreground lg:leading-snug lg:whitespace-normal">
          {children}
        </span>
      </span>
    </li>
  );
}
