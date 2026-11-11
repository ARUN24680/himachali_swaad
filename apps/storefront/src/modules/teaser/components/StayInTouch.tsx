import { Mail, MessageCircle } from 'lucide-react';
import { seller } from '@/config/site';
import { whatsappChatHref } from '@/lib/whatsapp';
import { WaitlistForm } from './WaitlistForm';

/**
 * The teaser's only conversion point (audit R-5): the waitlist form plus a WhatsApp chat button and an
 * e-mail link — each shown only when the channel is published (`NEXT_PUBLIC_SELLER_WHATSAPP` /
 * `_EMAIL`), never as a dead link. Server component; only the form hydrates. The prefilled WhatsApp
 * message is deliberately neutral (D-61: no product words anywhere on this page).
 */
export function StayInTouch() {
  const wa = whatsappChatHref('Hi! I saw the coming-soon page and would like to know when you open.');
  const email = seller.email;
  const channelCls =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-secondary-foreground/25 bg-secondary-foreground/5 px-5 text-sm font-semibold text-secondary-foreground outline-none backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-secondary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <section
      id="notify"
      aria-labelledby="notify-title"
      className="scroll-mt-8 px-4 pb-8 md:px-8"
      data-testid="stay-in-touch"
    >
      <div className="mx-auto grid max-w-3xl gap-8 rounded-3xl border border-primary/25 bg-secondary-foreground/4 p-6 shadow-2xl ring-1 ring-secondary-foreground/5 backdrop-blur-sm sm:p-8 md:p-10">
        <div className="grid gap-3 text-center">
          <p className="flex items-center justify-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
            Be the first to know
            <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
          </p>
          <h2 id="notify-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            Hear it from the hills
            <span className="block text-primary italic">before anyone else.</span>
          </h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-pretty text-secondary-foreground/75 md:text-base">
            Leave a number or an e-mail and we will send exactly one message on the day it opens. Nothing before,
            nothing after.
          </p>
        </div>

        <WaitlistForm source="coming-soon" />

        {(wa || email) && (
          <div className="grid gap-3 border-t border-secondary-foreground/10 pt-6 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] text-secondary-foreground/60 uppercase">
              Or just say hello
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={channelCls}
                  data-testid="teaser-whatsapp"
                >
                  <MessageCircle aria-hidden="true" className="size-4 text-primary" />
                  Chat on WhatsApp
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className={channelCls} data-testid="teaser-email">
                  <Mail aria-hidden="true" className="size-4 text-primary" />
                  Write to us
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
