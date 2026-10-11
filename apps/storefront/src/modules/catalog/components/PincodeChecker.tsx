'use client';

import { Input, Label, cn } from '@pk/ui';
import { CircleAlert, CircleCheck, CircleX, Loader2, MapPin } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { readLastPincode } from '@/lib/last-pincode';
import { useHydrated } from '@/lib/use-hydrated';
import { usePincodeCheck } from '../hooks/usePincodeCheck';

/** "Deliver to" checker: checking / serviceable (success) / not serviceable (destructive) / error. */
export function PincodeChecker() {
  const id = useId();
  const hydrated = useHydrated();
  // null = untouched → prefill with the last checked pincode once hydrated (localStorage is client-only)
  const [typed, setPincode] = useState<string | null>(null);
  const pincode = typed ?? (hydrated ? (readLastPincode() ?? '') : '');
  const check = usePincodeCheck(pincode);

  let status: { tone: 'success' | 'destructive' | 'muted' | 'error'; icon: ReactNode; text: ReactNode } | null = null;
  if (check.invalid) {
    status = { tone: 'error', icon: <CircleAlert />, text: 'Enter a valid 6-digit pincode' };
  } else if (check.checking) {
    status = { tone: 'muted', icon: <Loader2 className="animate-spin" />, text: 'Checking delivery…' };
  } else if (check.settled && check.isError) {
    status = {
      tone: 'error',
      icon: <CircleAlert />,
      text: (
        <>
          Couldn&rsquo;t check right now.{' '}
          <button
            type="button"
            onClick={() => void check.refetch()}
            className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          >
            Try again
          </button>
        </>
      ),
    };
  } else if (check.settled && check.data) {
    const d = check.data;
    status = d.serviceable
      ? {
          tone: 'success',
          icon: <CircleCheck />,
          text: (
            <>
              <span className="font-semibold">We deliver to {d.pincode}</span>
              {d.estimatedDays && (
                <span className="block text-foreground/80">
                  Usually {d.estimatedDays.min}–{d.estimatedDays.max} days after dispatch
                  {d.courierHint ? ` · ${d.courierHint}` : ''}
                </span>
              )}
            </>
          ),
        }
      : {
          tone: 'destructive',
          icon: <CircleX />,
          text: (
            <>
              <span className="font-semibold">Sorry, we can&rsquo;t deliver to {d.pincode} yet.</span>
              <span className="block">Try a nearby pincode (office or family address).</span>
            </>
          ),
        };
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/50 p-4" data-testid="pincode-checker">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <MapPin aria-hidden="true" className="size-4 text-accent-foreground" />
        Check delivery to your pincode
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        placeholder="6-digit pincode"
        value={pincode}
        onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-describedby={`${id}-status`}
        aria-invalid={check.invalid || undefined}
        className="h-11 max-w-56 tracking-[0.2em] tabular-nums placeholder:tracking-normal"
      />
      <div id={`${id}-status`} role="status" aria-live="polite" className="min-h-5 text-sm">
        {status && (
          <p
            className={cn(
              'flex items-start gap-2 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
              status.tone === 'success' && 'text-success',
              status.tone === 'destructive' && 'text-destructive',
              status.tone === 'error' && 'text-destructive',
              status.tone === 'muted' && 'text-muted-foreground',
            )}
          >
            {status.icon}
            <span>{status.text}</span>
          </p>
        )}
      </div>
    </div>
  );
}
