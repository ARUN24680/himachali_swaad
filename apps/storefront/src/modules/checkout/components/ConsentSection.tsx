'use client';

import { Checkbox, Label, cn } from '@pk/ui';
import { CreditCard, Landmark, ShieldCheck, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { fieldId, type CheckoutFormValues, type FieldErrors } from '../lib/checkout-form';
import { CheckoutSection } from './CheckoutSection';

type Setter = <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => void;

/**
 * DPDP consent (Rules §4.4): order updates are needed to fulfil the order (required, never pre-ticked);
 * WhatsApp is a separate opt-in, default OFF. Payment is prepaid only (D-25) — methods are chosen
 * inside Razorpay, so there is no method picker (and no COD) here.
 */
export function ConsentSection({
  values,
  errors,
  set,
}: {
  values: CheckoutFormValues;
  errors: FieldErrors;
  set: Setter;
}) {
  const updatesId = fieldId('orderUpdates');
  return (
    <CheckoutSection step={3} title="Updates & payment">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-start gap-3">
            <Checkbox
              id={updatesId}
              checked={values.orderUpdates}
              onCheckedChange={(c) => set('orderUpdates', c === true)}
              aria-invalid={errors.orderUpdates ? true : undefined}
              aria-describedby={errors.orderUpdates ? `${updatesId}-error` : `${updatesId}-hint`}
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label htmlFor={updatesId} className="leading-snug">
                Send me updates about this order by SMS and email
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
              </Label>
              <p id={`${updatesId}-hint`} className="text-sm text-muted-foreground">
                Payment, dispatch and delivery messages only — needed to get your jars to you.
              </p>
            </div>
          </div>
          {errors.orderUpdates && (
            <p id={`${updatesId}-error`} role="alert" className="pl-8 text-sm text-destructive">
              {errors.orderUpdates}
            </p>
          )}
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="checkout-whatsapp"
            checked={values.whatsappOptIn}
            onCheckedChange={(c) => set('whatsappOptIn', c === true)}
            aria-describedby="checkout-whatsapp-hint"
            className="mt-0.5"
          />
          <div className="grid gap-1">
            <Label htmlFor="checkout-whatsapp" className="leading-snug">
              Also send them on WhatsApp
            </Label>
            <p id="checkout-whatsapp-hint" className="text-sm text-muted-foreground">
              Optional. Without it we use SMS only. No marketing messages either way.
            </p>
          </div>
        </div>

        <div className="mt-1 rounded-lg border border-border bg-muted/50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck aria-hidden="true" className="size-4 text-success" />
            Prepaid · secure payment by Razorpay
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Payment methods">
            <Method icon={<Smartphone />} label="UPI — GPay, PhonePe, Paytm" highlight />
            <Method icon={<CreditCard />} label="Cards" />
            <Method icon={<Landmark />} label="Netbanking" />
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            You choose the method in the next step. Your jars are reserved for 15 minutes while you pay.
          </p>
        </div>
      </div>
    </CheckoutSection>
  );
}

function Method({ icon, label, highlight = false }: { icon: ReactNode; label: string; highlight?: boolean }) {
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium [&_svg]:size-3.5',
        highlight ? 'border-ring/40 bg-accent text-accent-foreground' : 'border-border bg-card text-muted-foreground',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </li>
  );
}
