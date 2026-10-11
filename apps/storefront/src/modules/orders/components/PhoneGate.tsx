'use client';

import { PHONE_REGEX } from '@pk/shared/patterns';
import { Button } from '@pk/ui';
import { ArrowRight, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField, fieldAria } from '@/components/common/FormField';
import { PhoneInput } from '@/components/common/PhoneInput';

/**
 * Shown when this browser doesn't know the checkout phone (new device / closed tab) or the phone
 * didn't match. Same generic message for "wrong phone" and "no such order" — no order enumeration.
 */
export function PhoneGate({
  orderCode,
  mismatch,
  checking,
  onSubmit,
}: {
  orderCode: string;
  mismatch: boolean;
  checking: boolean;
  onSubmit: (phoneE164: string) => void;
}) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = 'order-phone';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const phone = `+91${digits}`;
    if (!PHONE_REGEX.test(phone)) {
      setError(digits.length < 10 ? 'Enter your 10-digit mobile number' : 'Enter a valid Indian mobile number');
      return;
    }
    setError(null);
    onSubmit(phone);
  };

  const shownError =
    error ?? (mismatch ? "We couldn't find this order with that number. Check both and try again." : undefined);

  return (
    <section
      aria-labelledby="phone-gate-title"
      className="mx-auto grid w-full max-w-md gap-5 rounded-lg border border-border bg-card p-5 sm:p-8"
      data-testid="phone-gate"
    >
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full border border-border bg-muted text-accent-foreground [&_svg]:size-7"
      >
        <Smartphone />
      </span>
      <div className="grid gap-1.5">
        <h1 id="phone-gate-title" className="font-serif text-2xl font-medium text-foreground">
          Enter the phone number used for this order
        </h1>
        <p className="text-muted-foreground">
          To keep your order private, we show <span className="font-mono font-medium text-foreground">{orderCode}</span>{' '}
          only to the number it was placed with.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <FormField id={id} label="Mobile number" error={shownError}>
          <PhoneInput
            {...fieldAria(id, shownError, false)}
            value={digits}
            onValueChange={(d) => {
              setDigits(d);
              if (error) setError(null);
            }}
            autoFocus
          />
        </FormField>
        <Button type="submit" size="lg" disabled={checking} className="w-full">
          {checking ? 'Checking…' : 'Show my order'}
          {!checking && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>
    </section>
  );
}
