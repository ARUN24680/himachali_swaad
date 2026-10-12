import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { whatsappChatHref } from '@/lib/whatsapp';

/** Pre-filled WhatsApp text — the order code lets support find the parcel without asking. */
export const supportMessage = (orderCode: string) => `Namaste! I need help with my Pahadi Khatki order ${orderCode}.`;

/**
 * "Parcel ke baare me help chahiye?" (Phase 8 §8.2). Opens WhatsApp with the order code pre-filled,
 * using the seller number from src/config/site.ts. Until that number is published, it links to
 * /contact instead (we never invent a number).
 */
export function SupportCta({
  orderCode,
  emphasis = false,
  className,
}: {
  orderCode: string;
  /** Delivery failed: make the CTA the primary action. */
  emphasis?: boolean;
  className?: string;
}) {
  const href = whatsappChatHref(supportMessage(orderCode));
  return (
    <section
      aria-labelledby="support-title"
      className={cn(
        'grid gap-4 rounded-lg border p-5 sm:p-6',
        emphasis ? 'border-warning/30 bg-warning/10' : 'border-border bg-card',
        className,
      )}
      data-testid="support-cta"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-muted text-accent-foreground [&_svg]:size-4.5"
        >
          <MessageCircle />
        </span>
        <div className="grid gap-1">
          <h2 id="support-title" className="font-serif text-lg leading-snug font-medium text-foreground">
            Parcel ke baare me help chahiye?
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {href
              ? 'Chat with us on WhatsApp — your order code is already in the message.'
              : 'Reach our team on any channel on the contact page — keep your order code handy.'}{' '}
            <span className="font-mono font-medium whitespace-nowrap text-foreground">{orderCode}</span>
          </p>
        </div>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: emphasis ? 'primary' : 'secondary' }), 'w-full')}
          data-testid="support-whatsapp"
        >
          <MessageCircle aria-hidden="true" />
          Chat with us
          <span className="sr-only">on WhatsApp (opens in a new tab)</span>
        </a>
      ) : (
        <Link
          href="/contact"
          className={cn(buttonVariants({ variant: emphasis ? 'primary' : 'secondary' }), 'w-full')}
          data-testid="support-contact"
        >
          Chat with us
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
