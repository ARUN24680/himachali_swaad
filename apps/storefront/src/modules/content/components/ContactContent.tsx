import { Clock, Mail, MapPin, MessageCircle, Phone, ShieldQuestion } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { SectionHeading } from '@/components/common/SectionHeading';
import { seller } from '@/config/site';
import { SellerCard } from './SellerCard';

/** Contact page (Razorpay KYC + E-Commerce Rules): phone, email, WhatsApp, address, hours, grievance link. */
export function ContactContent() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:px-8 md:py-14">
      <SectionHeading
        as="h1"
        eyebrow="We're here to help"
        title="Contact us"
        lead="Questions about an order, a damaged jar or bulk gifting? Reach us on any of these — keep your order code handy."
      />
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="contact-channels">
        <Channel icon={<Phone />} title="Call customer care">
          <PendingValue value={seller.phone} label="Customer care phone">
            {(v) => <a href={`tel:${v.replace(/\s/g, '')}`}>{v}</a>}
          </PendingValue>
        </Channel>
        <Channel icon={<MessageCircle />} title="WhatsApp">
          <PendingValue value={seller.whatsapp} label="WhatsApp number">
            {(v) => (
              <a href={`https://wa.me/${v}`} target="_blank" rel="noopener noreferrer">
                Chat with us on WhatsApp
              </a>
            )}
          </PendingValue>
        </Channel>
        <Channel icon={<Mail />} title="Email">
          <PendingValue value={seller.email} label="Customer care email">
            {(v) => <a href={`mailto:${v}`}>{v}</a>}
          </PendingValue>
        </Channel>
        <Channel icon={<Clock />} title="Support hours">
          <PendingValue value={seller.supportHours} label="Support hours" />
        </Channel>
        <Channel icon={<MapPin />} title="Registered address" wide>
          <PendingValue value={seller.address} label="Registered address" />
        </Channel>
      </ul>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-start">
        <section aria-labelledby="seller-title" className="grid gap-3">
          <h2 id="seller-title" className="font-serif text-2xl font-medium text-foreground">
            Seller details
          </h2>
          <SellerCard />
        </section>
        <section
          aria-labelledby="grievance-title"
          className="grid gap-3 rounded-lg border border-border bg-muted/50 p-5"
        >
          <h2 id="grievance-title" className="flex items-center gap-2 font-serif text-2xl font-medium text-foreground">
            <ShieldQuestion aria-hidden="true" className="size-5 text-accent-foreground" />
            Not resolved?
          </h2>
          <p className="text-muted-foreground">
            Our Grievance Officer acknowledges complaints within 48 hours and resolves them within one month.
          </p>
          <Link href="/grievance" className="w-fit font-medium text-accent-foreground underline underline-offset-4">
            Grievance redressal process
          </Link>
        </section>
      </div>
    </div>
  );
}

function Channel({
  icon,
  title,
  children,
  wide,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <li className={`flex gap-4 rounded-lg border border-border bg-card p-5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="grid min-w-0 gap-1">
        <h2 className="font-sans text-sm font-semibold text-foreground">{title}</h2>
        <div className="min-w-0 break-words text-muted-foreground [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-medium [&_a]:text-accent-foreground [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </div>
      </div>
    </li>
  );
}
