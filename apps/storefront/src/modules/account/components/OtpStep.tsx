'use client';

import { maskPhone, type SessionUser } from '@pk/shared';
import { Alert, Button, OtpInput } from '@pk/ui';
import { AlertCircle, CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/lib/api-client';
import { useSendOtp, useVerifyOtp } from '../hooks/useAuthMutations';
import { formatClock, formatWait, useCountdown } from '../hooks/useCountdown';

/** Backend kills a code after 5 wrong tries (Phase 2 §2.2) — after that only a new code helps. */
const MAX_ATTEMPTS = 5;

interface OtpStepProps {
  phone: string;
  resendAfterSec: number;
  onChangeNumber: () => void;
  onVerified: (user: SessionUser) => void;
}

export function OtpStep({ phone, resendAfterSec, onChangeNumber, onVerified }: OtpStepProps) {
  const codeId = useId();
  const statusId = useId();
  const [code, setCode] = useState('');
  const [wrongTries, setWrongTries] = useState(0);
  const [resendAt, setResendAt] = useState(() => Date.now() + resendAfterSec * 1000);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const verify = useVerifyOtp();
  const resend = useSendOtp();
  const resendIn = useCountdown(resendAt);
  const blockedFor = useCountdown(blockedUntil);
  const codeDead = wrongTries >= MAX_ATTEMPTS;

  const submit = (value: string) => {
    if (value.length !== 6 || verify.isPending || codeDead) return;
    setNotice(null);
    verify.mutate(
      { phone, otp: value },
      {
        onSuccess: ({ user }) => onVerified(user),
        onError: (err) => {
          if (isApiError(err, 'OTP_INVALID')) {
            setWrongTries((n) => n + 1);
            setCode('');
          }
        },
      },
    );
  };

  const onResend = () => {
    verify.reset();
    setNotice(null);
    resend.mutate(
      { phone },
      {
        onSuccess: (res) => {
          setResendAt(Date.now() + res.resendAfterSec * 1000);
          setWrongTries(0);
          setCode('');
          setNotice('A new code is on its way.');
        },
        onError: (err) => {
          if (isApiError(err, 'RATE_LIMITED')) setBlockedUntil(Date.now() + (err.retryAfterSeconds ?? 60) * 1000);
        },
      },
    );
  };

  const formSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(code);
  };

  let error: string | null = null;
  if (codeDead) error = 'Too many wrong tries for this code. Please request a new one.';
  else if (isApiError(verify.error, 'OTP_INVALID'))
    error = `That code didn't match. Check the SMS and try again (${MAX_ATTEMPTS - wrongTries} ${MAX_ATTEMPTS - wrongTries === 1 ? 'try' : 'tries'} left).`;
  else if (isApiError(verify.error, 'NETWORK_ERROR') || isApiError(resend.error, 'NETWORK_ERROR'))
    error = 'You seem to be offline. Check your connection and try again.';
  else if (isApiError(resend.error, 'RATE_LIMITED') && blockedFor > 0)
    error = `Too many code requests. You can ask for a new code in ${formatWait(blockedFor)}.`;
  else if (isApiError(resend.error, 'UPSTREAM_UNAVAILABLE'))
    error = "We couldn't send a new code right now. Please try again in a minute.";
  else if (verify.error)
    error = isApiError(verify.error) ? verify.error.message : 'Something went wrong. Please try again.';

  const canResend = resendIn === 0 && blockedFor === 0 && !resend.isPending;
  const masked = maskPhone(phone)?.replace(/^\+91/, '+91 ');

  return (
    <form onSubmit={formSubmit} noValidate className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>
          Sent to <span className="font-medium text-foreground tabular-nums">{masked}</span>
        </span>
        <Button type="button" variant="link" className="min-h-11 px-1 text-sm" onClick={onChangeNumber}>
          <Pencil aria-hidden="true" />
          Change number
        </Button>
      </div>

      <div className="grid gap-2">
        <label htmlFor={codeId} className="text-sm leading-none font-medium text-foreground">
          6-digit code
        </label>
        <OtpInput
          id={codeId}
          label="6-digit verification code"
          value={code}
          onChange={(v) => {
            setCode(v);
            if (verify.isError && !codeDead) verify.reset();
          }}
          onComplete={submit}
          invalid={Boolean(error) && !codeDead}
          disabled={verify.isPending || codeDead}
          autoFocus
          aria-describedby={statusId}
        />
      </div>

      <div id={statusId} aria-live="polite" className="grid gap-3 empty:hidden">
        {error && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
          </Alert>
        )}
        {!error && notice && (
          <Alert tone="success">
            <CheckCircle2 aria-hidden="true" />
            <span>{notice}</span>
          </Alert>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || verify.isPending || codeDead}>
        {verify.isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Verifying…
          </>
        ) : (
          'Verify and sign in'
        )}
      </Button>

      <div className="flex min-h-11 items-center justify-center text-sm text-muted-foreground">
        {resendIn > 0 ? (
          <p>
            Didn&rsquo;t get it? Resend in{' '}
            <span className="font-medium text-foreground tabular-nums" aria-hidden="true">
              {formatClock(resendIn)}
            </span>
            <span className="sr-only">{resendIn} seconds</span>
          </p>
        ) : (
          <Button
            type="button"
            variant="link"
            className="min-h-11 px-1 text-sm"
            onClick={onResend}
            disabled={!canResend}
          >
            {resend.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Sending a new code…
              </>
            ) : (
              'Resend code'
            )}
          </Button>
        )}
      </div>
    </form>
  );
}
