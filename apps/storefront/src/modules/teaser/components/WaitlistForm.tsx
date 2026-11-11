'use client';

import type { WaitlistSource } from '@pk/shared';
import { PHONE_REGEX } from '@pk/shared/patterns';
import { Button, Checkbox, Input, Label, cn } from '@pk/ui';
import { AlertCircle, BellRing, Check, Loader2, RefreshCcw, Sparkles } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/lib/api-client';
import { toNationalDigits } from '@/lib/phone';
import { formatWait, useCountdown } from '@/lib/use-countdown';
import { useJoinWaitlist } from '../hooks/useJoinWaitlist';

/** Loose client-side e-mail check; the server (zod) is the authority. */
const EMAIL_LOOSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Contact = { phone: string } | { email: string } | null;

/** "98765 43210" / "+91 98765-43210" → phone; "a@b.in" → email; anything else → null. */
function parseContact(raw: string): Contact {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes('@')) return EMAIL_LOOSE.test(value) ? { email: value.toLowerCase() } : null;
  const digits = toNationalDigits(value);
  return PHONE_REGEX.test(`+91${digits}`) ? { phone: `+91${digits}` } : null;
}

type Outcome = { kind: 'joined'; already: boolean } | null;

/**
 * Waitlist sign-up on the pre-launch teaser (audit R-5). One smart field takes a mobile number OR an
 * e-mail (fewer fields, less friction), an optional first name, and an explicit DPDP consent box that
 * is never pre-ticked. The copy keeps the teaser's secret (D-61): it never names the product.
 *
 * States: idle → submitting → joined / already on the list; field error (client or 4xx);
 * rate-limited (429, counts down `retryAfterSeconds`); network / unknown error with retry.
 * Styled for the Deep Pine band (secondary tokens) with the gold primary CTA.
 */
export function WaitlistForm({ source = 'coming-soon', className }: { source?: WaitlistSource; className?: string }) {
  const id = useId();
  const contactId = `${id}-contact`;
  const nameId = `${id}-name`;
  const consentId = `${id}-consent`;

  const [contact, setContact] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const join = useJoinWaitlist();
  const waitSeconds = useCountdown(retryAt);
  const rateLimited = waitSeconds > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (join.isPending || rateLimited) return;
    const parsed = parseContact(contact);
    const nextFieldError = parsed ? null : 'Enter a 10-digit mobile number or an e-mail address';
    const nextConsentError = consent ? null : 'Tick the box so we know we may message you once';
    setFieldError(nextFieldError);
    setConsentError(nextConsentError);
    setProblem(null);
    if (!parsed || !consent) {
      document.getElementById(nextFieldError ? contactId : consentId)?.focus();
      return;
    }
    try {
      const res = await join.mutateAsync({
        ...parsed,
        ...(name.trim() ? { name: name.trim() } : {}),
        source,
        consent: true,
      });
      setOutcome({ kind: 'joined', already: res.alreadyJoined });
    } catch (err) {
      if (isApiError(err, 'RATE_LIMITED')) {
        setRetryAt(Date.now() + (err.retryAfterSeconds ?? 60) * 1000);
        return;
      }
      if (isApiError(err) && (err.status === 400 || err.status === 422)) {
        setFieldError(err.message);
        document.getElementById(contactId)?.focus();
        return;
      }
      setProblem(
        isApiError(err, 'NETWORK_ERROR')
          ? 'We could not reach the hills just now. Check your connection and try again.'
          : 'Something went wrong on our side. Please try again in a moment.',
      );
    }
  }

  if (outcome) {
    return (
      <div
        role="status"
        data-testid="waitlist-success"
        className={cn(
          'grid justify-items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-6 py-8 text-center',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-6"
        >
          <Check strokeWidth={3} />
        </span>
        <p className="font-serif text-2xl font-medium text-balance md:text-3xl">
          {outcome.already ? 'You’re already on the list.' : 'You’re on the list.'}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-pretty text-secondary-foreground/80">
          {outcome.already
            ? 'We have your details from before — one message when the mountains open, nothing else.'
            : 'One message when it opens. No newsletters, no marketing — we don’t do that.'}
        </p>
      </div>
    );
  }

  const busy = join.isPending;
  const fieldCls =
    'h-12 border-secondary-foreground/30 bg-secondary-foreground/5 text-secondary-foreground placeholder:text-secondary-foreground/45 focus-visible:border-primary focus-visible:ring-primary/30 aria-invalid:border-destructive';

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      aria-busy={busy}
      data-testid="waitlist-form"
      className={cn('grid gap-4 text-left', className)}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,11rem)]">
        <div className="grid gap-2">
          <Label htmlFor={contactId} className="text-secondary-foreground">
            Mobile number or e-mail
          </Label>
          <Input
            id={contactId}
            name="contact"
            type="text"
            inputMode="email"
            autoComplete="on"
            enterKeyHint="send"
            placeholder="98765 43210 or you@example.com"
            value={contact}
            onChange={(e) => {
              setContact(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${contactId}-error` : `${contactId}-hint`}
            disabled={busy}
            className={fieldCls}
          />
          {fieldError ? (
            <p id={`${contactId}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {fieldError}
            </p>
          ) : (
            <p id={`${contactId}-hint`} className="text-xs text-secondary-foreground/60">
              Indian mobile numbers get one SMS or WhatsApp message; e-mails get one e-mail.
            </p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={nameId} className="text-secondary-foreground">
            First name <span className="font-normal text-secondary-foreground/60">(optional)</span>
          </Label>
          <Input
            id={nameId}
            name="name"
            type="text"
            autoComplete="given-name"
            maxLength={80}
            placeholder="Asha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className={fieldCls}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-start gap-3">
          <Checkbox
            id={consentId}
            checked={consent}
            onCheckedChange={(c) => {
              setConsent(c === true);
              if (consentError) setConsentError(null);
            }}
            disabled={busy}
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? `${consentId}-error` : undefined}
            className="mt-0.5 border-secondary-foreground/50 bg-transparent data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          />
          <Label htmlFor={consentId} className="cursor-pointer leading-snug text-secondary-foreground/90">
            Message me once when it opens — no marketing.
          </Label>
        </div>
        {consentError && (
          <p id={`${consentId}-error`} role="alert" className="pl-8 text-sm text-destructive">
            {consentError}
          </p>
        )}
      </div>

      {rateLimited && (
        <p
          role="status"
          data-testid="waitlist-rate-limited"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/15 px-3.5 py-3 text-sm text-secondary-foreground"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            That’s a few tries in a row. You can send again in{' '}
            <span className="font-semibold tabular-nums">{formatWait(waitSeconds)}</span>.
          </span>
        </p>
      )}
      {problem && (
        <p
          role="alert"
          data-testid="waitlist-error"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/15 px-3.5 py-3 text-sm text-secondary-foreground"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          disabled={busy || rateLimited}
          className="w-full shadow-lg shadow-primary/25 focus-visible:ring-offset-secondary sm:w-auto sm:px-8"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : problem ? (
            <RefreshCcw aria-hidden="true" />
          ) : (
            <BellRing aria-hidden="true" />
          )}
          {busy ? 'Sending…' : problem ? 'Try again' : 'Tell me first'}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-secondary-foreground/60">
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          One message. Then silence until the hills say so.
        </p>
      </div>
    </form>
  );
}
