import { NonVegMark } from '@pk/ui';
import { Mail, MessageCircle, MountainSnow, Phone } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { legalNav, mainNav } from '@/config/navigation';
import { seller, site } from '@/config/site';

const linkCls =
  'inline-flex min-h-11 items-center rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-9';

/**
 * Footer on every page: seller entity, address, FSSAI, GSTIN, customer care, grievance officer and
 * legal links (Consumer Protection (E-Commerce) Rules 2020 + Razorpay KYC). Undecided facts show "Pending".
 * `consentControl` is a slot so this layout component stays free of feature imports (D-44).
 */
export function SiteFooter({ consentControl }: { consentControl?: ReactNode }) {
  const year = new Date().getFullYear();
  const g = seller.grievanceOfficer;
  return (
    <footer
      className="mt-auto border-t border-border bg-muted/50 text-sm text-muted-foreground"
      data-testid="site-footer"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-[1.2fr_2fr] lg:gap-16">
        <div className="grid content-start gap-4">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 rounded-md font-serif text-2xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MountainSnow aria-hidden="true" className="size-6 text-accent-foreground" />
            {site.name}
          </Link>
          <p className="max-w-sm leading-relaxed">{site.tagline}. Prepaid orders, shipped across India.</p>
          <p className="flex items-center gap-2 text-foreground">
            <NonVegMark size="md" />
            All our products are non-vegetarian.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
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
                  <a href={`mailto:${v}`} className={`${linkCls} break-all`}>
                    {v}
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
          </FooterCol>
        </div>
      </div>

      <div className="border-t border-border">
        <dl
          className="mx-auto grid max-w-6xl gap-x-8 gap-y-3 px-4 py-6 text-xs sm:grid-cols-2 md:px-8 lg:grid-cols-4"
          aria-label="Seller information"
          data-testid="seller-details"
        >
          <SellerFact term="Sold by">
            <PendingValue value={seller.legalName} label="Seller legal entity" />
          </SellerFact>
          <SellerFact term="Registered address">
            <PendingValue value={seller.address} label="Registered address" />
          </SellerFact>
          <SellerFact term="FSSAI Lic. No.">
            <PendingValue value={seller.fssaiLicenseNo} label="FSSAI licence number" />
          </SellerFact>
          <SellerFact term="GSTIN">
            <PendingValue value={seller.gstin} label="GSTIN" />
          </SellerFact>
          <SellerFact term="Grievance officer">
            <span className="grid justify-items-start gap-0.5">
              <PendingValue value={g.name} label="Grievance officer name" />
              {g.email && (
                <a
                  href={`mailto:${g.email}`}
                  className="w-fit break-all underline underline-offset-2 hover:text-foreground"
                >
                  {g.email}
                </a>
              )}
              <Link href="/grievance" className="w-fit underline underline-offset-2 hover:text-foreground">
                How to raise a grievance
              </Link>
            </span>
          </SellerFact>
        </dl>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            © {year} {seller.legalName ?? site.name}. All prices are MRP inclusive of all taxes.
          </p>
          <p>Prepaid orders only · UPI, cards &amp; netbanking</p>
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

function SellerFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="font-semibold text-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
