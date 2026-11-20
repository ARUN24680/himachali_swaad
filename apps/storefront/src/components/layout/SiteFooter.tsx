import { BrandLogo } from '@/components/common/BrandLogo';
import { Camera, Clock, Mail, MessageCircle, Phone, PlaySquare, ShieldCheck, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { TrustStrip } from './TrustStrip';
import { legalNav, mainNav } from '@/config/navigation';
import { publishedSocialLinks, seller, site, type SocialNetwork } from '@/config/site';

const linkCls =
  'inline-flex min-h-11 items-center rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-9';

const SOCIAL: Record<SocialNetwork, { label: string; icon: ReactNode }> = {
  instagram: { label: 'Instagram', icon: <Camera /> },
  facebook: { label: 'Facebook', icon: <ThumbsUp /> },
  youtube: { label: 'YouTube', icon: <PlaySquare /> },
};

/**
 * Footer on every page: opens with the TrustStrip (seller entity, address, FSSAI, GSTIN, grievance
 * officer — shown once), then customer care (phone / e-mail /
 * WhatsApp / hours), social profiles, grievance officer and legal links (Consumer Protection
 * (E-Commerce) Rules 2020 + Razorpay KYC). Undecided facts show "Pending". Social icons render only
 * for networks with a URL (audit §3.4 — never a dead link). `consentControl` is a slot so this layout
 * component stays free of feature imports (D-44).
 */
export function SiteFooter({ consentControl }: { consentControl?: ReactNode }) {
  const year = new Date().getFullYear();
  const socials = publishedSocialLinks();
  return (
    <footer
      className="mt-auto border-t border-border bg-muted/50 text-sm text-muted-foreground"
      data-testid="site-footer"
    >
      {/* Trust facts + the seller disclosures (single place, no repeat below) */}
      <TrustStrip />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-[1.2fr_2fr] lg:gap-16">
        <div className="grid content-start gap-4">
          <Link
            href="/"
            aria-label={site.name}
            className="flex w-fit items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandLogo size="lg" />
          </Link>
          <p className="max-w-sm leading-relaxed">{site.tagline}. Prepaid orders, shipped across India.</p>
          {socials.length > 0 && (
            <div className="grid gap-2" data-testid="footer-social">
              <p className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">Follow the kitchen</p>
              <ul className="flex flex-wrap gap-2">
                {socials.map(([network, url]) => (
                  <li key={network}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${site.name} on ${SOCIAL[network].label}`}
                      className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors outline-none hover:border-primary hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5"
                    >
                      {SOCIAL[network].icon}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-[1fr_1fr_1.35fr]">
          <FooterCol title="Shop">
            {mainNav.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterCol>
          <FooterCol title="Policies">
            {legalNav.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>{consentControl}</li>
          </FooterCol>
          <FooterCol title="Customer care" wide>
            <li>
              <Link href="/track" className={linkCls}>
                Track your order
              </Link>
            </li>
            <li className="flex min-h-9 items-center gap-2">
              <Phone aria-hidden="true" className="size-4 shrink-0" />
              <PendingValue value={seller.phone} label="Customer care phone">
                {(v) => (
                  <a href={`tel:${v.replace(/\s/g, '')}`} className={linkCls}>
                    {v}
                  </a>
                )}
              </PendingValue>
            </li>
            <li className="flex min-h-9 items-center gap-2">
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              <PendingValue value={seller.email} label="Customer care email">
                {(v) => (
                  <a href={`mailto:${v}`} className={`${linkCls} min-w-0 break-words`}>
                    {/* Break only after the "@" (never mid-word) when the column is narrow */}
                    {v.split('@')[0]}@<wbr />
                    {v.split('@').slice(1).join('@')}
                  </a>
                )}
              </PendingValue>
            </li>
            <li className="flex min-h-9 items-center gap-2">
              <MessageCircle aria-hidden="true" className="size-4 shrink-0" />
              <PendingValue value={seller.whatsapp} label="WhatsApp number">
                {(v) => (
                  <a href={`https://wa.me/${v}`} className={linkCls} rel="noopener noreferrer" target="_blank">
                    WhatsApp us
                  </a>
                )}
              </PendingValue>
            </li>
            <li className="flex min-h-9 items-start gap-2 pt-2">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="grid gap-0.5">
                <span className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase">Support hours</span>
                <PendingValue value={seller.supportHours} label="Support hours" />
              </span>
            </li>
          </FooterCol>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            © {year} {seller.legalName ?? site.name}. All prices are MRP inclusive of all taxes.
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
            Prepaid orders only · UPI, cards &amp; netbanking
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid content-start gap-2 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <h2 className="font-sans text-xs font-semibold tracking-[0.12em] text-foreground uppercase">{title}</h2>
      <ul className="grid">{children}</ul>
    </div>
  );
}
