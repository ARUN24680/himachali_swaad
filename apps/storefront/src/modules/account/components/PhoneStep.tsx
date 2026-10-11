'use client';

import { PHONE_REGEX } from '@pk/shared/patterns';
import { Alert, Button, Label } from '@pk/ui';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/lib/api-client';
import { toNationalDigits } from '@/lib/phone';
import { formatWait, useCountdown } from '../hooks/useCountdown';
import { useSendOtp } from '../hooks/useAuthMutations';

interface PhoneStepProps {
  initialPhone: string;
  onSent: (phone: string, resendAfterSec: number) => void;
}

export function PhoneStep({ initialPhone, onSent }: PhoneStepProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [digits, setDigits] = useState(initialPhone.replace(/^\+91/, ''));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const sendOtp = useSendOtp();
  const waitSec = useCountdown(blockedUntil);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const phone = `+91${digits}`;
    if (!PHONE_REGEX.test(phone)) {
      setFieldError(digits.length < 10 ? 'Enter your 10-digit mobile number' : 'Enter a valid Indian mobile number');
      return;
    }
    setFieldError(null);
    sendOtp.mutate(
      { phone },
      {
        onSuccess: (res) => onSent(phone, res.resendAfterSec),
        onError: (err) => {
          if (isApiError(err, 'RATE_LIMITED')) setBlockedUntil(Date.now() + (err.retryAfterSeconds ?? 60) * 1000);
        },
      },
    );
  };

  const err = sendOtp.error;
  const rateLimited = isApiError(err, 'RATE_LIMITED') && waitSec > 0;
  let serverError: string | null = null;
  if (rateLimited) serverError = `Too many code requests. Please try again in ${formatWait(waitSec)}.`;
  else if (isApiError(err, 'NETWORK_ERROR'))
    serverError = 'You seem to be offline. Check your connection and try again.';
  else if (isApiError(err, 'UPSTREAM_UNAVAILABLE'))
    serverError = "We couldn't send the code right now. Please try again in a minute.";
  else if (err && !isApiError(err, 'RATE_LIMITED'))
    serverError = isApiError(err) ? err.message : 'Something went wrong. Please try again.';

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor={inputId}>
          Mobile number<span className="sr-only"> (India, +91)</span>
        </Label>
        <div className="flex h-12 w-full items-stretch overflow-hidden rounded-lg border border-input bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 has-aria-invalid:border-destructive">
          <span
            aria-hidden="true"
            className="flex items-center border-r border-border bg-muted px-3.5 text-base font-medium text-muted-foreground tabular-nums"
          >
            +91
          </span>
          <input
            id={inputId}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            autoFocus
            value={digits}
            onChange={(e) => {
              setDigits(toNationalDigits(e.target.value));
              if (fieldError) setFieldError(null);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : hintId}
            className="w-full min-w-0 bg-transparent px-3.5 text-base tracking-wide text-foreground tabular-nums outline-none placeholder:text-muted-foreground"
          />
        </div>
        {fieldError ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {fieldError}
          </p>
        ) : (
          <p id={hintId} className="text-sm text-muted-foreground">
            We&rsquo;ll text you a 6-digit code. No password needed.
          </p>
        )}
      </div>

      {serverError && (
        <Alert tone="destructive">
          <AlertCircle aria-hidden="true" />
          <span>{serverError}</span>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={sendOtp.isPending || rateLimited}>
        {sendOtp.isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Sending code…
          </>
        ) : (
          <>
            Send code
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
