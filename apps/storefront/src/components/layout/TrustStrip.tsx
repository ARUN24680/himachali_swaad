import { NonVegMark, cn } from '@pk/ui';
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Landmark,
  Leaf,
  MapPin,
  MessageSquareWarning,
  ShieldCheck,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { origin, seller } from '@/config/site';

/**
 * Trust & seller panel — the ONE place (top of the footer, every page) for the facts a food buyer
 * checks before paying and the seller disclosures the Consumer Protection (E-Commerce) Rules 2020
 * require: legal entity, registered address, FSSAI licence, GSTIN and grievance officer (audit
 * 2026-11-03 §3.3, R-7). Styled as a sage band (same language as the hero) with an ivory "label
 * card" for the seller facts. Unset identifiers show a visible "Pending" marker, never a made-up
 * number. Server component.
 */
export function TrustStrip({ className }: { className?: string }) {
  const g = seller.grievanceOfficer;
  return (
    <section
      aria-labelledby="trust-title"
      className={cn('bg-background px-4 pt-4 pb-12 md:px-8 md:pb-16', className)}
      data-testid="trust-strip"
    >
      <div className="relative isolate mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-[2rem] bg-secondary p-6 text-secondary-foreground sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:p-12">
        {/* Soft ivory light + a deeper sage foot, as on the hero bands */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-radial-[ellipse_at_0%_0%] from-card/40 to-transparent to-60% dark:from-secondary-foreground/8"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-linear-to-t from-primary/10 to-transparent dark:hidden"
        />

        <div className="grid content-center gap-6">
          <div className="grid gap-4">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-secondary-foreground/10 bg-card/45 px-3.5 py-1.5 text-[0.6875rem] font-semibold tracking-[0.2em] text-primary uppercase shadow-sm backdrop-blur-sm dark:bg-secondary-foreground/5">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Trust &amp; compliance
            </p>
            <h2
              id="trust-title"
              className="font-serif text-3xl leading-[1.1] font-medium tracking-tight text-balance md:text-4xl"
            >
              Honest from the kitchen <span className="block font-normal text-primary italic">to your door.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-pretty text-secondary-foreground/85">
              Every jar is made, labelled and sold by the people named here — batch code and dates on each lid.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            <Fact icon={<MapPin />} term="Made in">
              {origin.place}
            </Fact>
            <Fact icon={<Leaf />} term="In the jar">
              No added preservatives
            </Fact>
            <Fact icon={<ShieldCheck />} term="Payment">
              Prepaid · UPI, cards, netbanking
            </Fact>
            <Fact icon={<NonVegMark size="md" />} term="Food type">
              100% non-vegetarian
            </Fact>
          </ul>
        </div>

        {/* Ivory "label card": the legal seller facts, read like the back of a jar */}
        <div className="rounded-3xl border border-card/60 bg-card p-5 text-card-foreground shadow-2xl shadow-primary/15 sm:p-7 dark:border-border dark:shadow-none">
          <div className="flex items-center gap-3 pb-4">
            <span className="text-[0.6875rem] font-semibold tracking-[0.2em] whitespace-nowrap text-muted-foreground uppercase">
              Seller information
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>

          <dl
            className="grid divide-y divide-dashed divide-border"
            aria-label="Seller information"
            data-testid="seller-details"
          >
            <SellerFact icon={<Store />} term="Sold by">
              <PendingValue value={seller.legalName} label="Seller legal entity" />
            </SellerFact>
            <SellerFact icon={<Building2 />} term="Registered address">
              <PendingValue value={seller.address} label="Registered address" />
            </SellerFact>
            <SellerFact icon={<BadgeCheck />} term="FSSAI Lic. No.">
              <PendingValue value={seller.fssaiLicenseNo} label="FSSAI licence number">
                {(v) => <span className="tabular-nums">{v}</span>}
              </PendingValue>
            </SellerFact>
            <SellerFact icon={<Landmark />} term="GSTIN">
              <PendingValue value={seller.gstin} label="GSTIN">
                {(v) => <span className="tabular-nums">{v}</span>}
              </PendingValue>
            </SellerFact>
            <SellerFact icon={<MessageSquareWarning />} term="Grievance officer">
              <span className="grid justify-items-start gap-1 sm:justify-items-end">
                <PendingValue value={g.name} label="Grievance officer name" />
                {g.email && (
                  <a
                    href={`mailto:${g.email}`}
                    className="w-fit break-all text-accent-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {g.email}
                  </a>
                )}
              </span>
            </SellerFact>
          </dl>

          <Link
            href="/grievance"
            className="group mt-4 flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 text-sm font-medium text-accent-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            How to raise a grievance
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Fact({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-secondary-foreground/10 bg-card/45 p-3 backdrop-blur-sm dark:bg-secondary-foreground/5">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-primary shadow-sm dark:bg-secondary [&_svg]:size-4.5"
      >
        {icon}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-secondary-foreground/80 uppercase">
          {term}
        </span>
        <span className="text-sm leading-snug font-medium text-pretty">{children}</span>
      </span>
    </li>
  );
}

function SellerFact({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-3.5 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6">
      <dt className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-4"
        >
          {icon}
        </span>
        {term}
      </dt>
      <dd className="min-w-0 pl-10.5 text-sm font-medium break-words text-foreground sm:pl-0 sm:text-right">
        {children}
      </dd>
    </div>
  );
}
