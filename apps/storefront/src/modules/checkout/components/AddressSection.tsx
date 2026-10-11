'use client';

import type { PincodeCheckResponse, SavedAddress } from '@pk/shared';
import { Badge, Checkbox, Input, Label, RadioCard, RadioDot, RadioGroup, Skeleton } from '@pk/ui';
import { AlertTriangle, Loader2, MapPin, Sparkles, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { FormField, fieldAria } from '@/components/common/FormField';
import { fieldId, type CheckoutFormValues, type FieldErrors } from '../lib/checkout-form';
import { CheckoutSection } from './CheckoutSection';

type Setter = <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => void;

export interface PincodeStatus {
  checking: boolean;
  invalid: boolean;
  result: PincodeCheckResponse | undefined;
  /** City/state came from the India Post lookup for this pincode (still editable). */
  autoFilled: boolean;
  localityLoading: boolean;
}

export function AddressSection({
  values,
  errors,
  set,
  pincode,
  signedIn,
  saved,
  savedLoading,
  selectedSavedId,
  onPickSaved,
}: {
  values: CheckoutFormValues;
  errors: FieldErrors;
  set: Setter;
  pincode: PincodeStatus;
  signedIn: boolean;
  saved: SavedAddress[];
  savedLoading: boolean;
  selectedSavedId: string | null;
  onPickSaved: (a: SavedAddress) => void;
}) {
  const ids = {
    pincode: fieldId('pincode'),
    line1: fieldId('line1'),
    line2: fieldId('line2'),
    landmark: fieldId('landmark'),
    city: fieldId('city'),
    state: fieldId('state'),
  };
  const res = pincode.result;

  let pinHint: ReactNode = 'We fill in your city and state.';
  if (pincode.checking || pincode.localityLoading) {
    pinHint = (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Checking delivery…
      </span>
    );
  } else if (res && res.pincode === values.pincode && res.serviceable) {
    pinHint = (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Truck aria-hidden="true" className="size-4 shrink-0" />
        {res.estimatedDays
          ? `Delivers in ${res.estimatedDays.min}–${res.estimatedDays.max} days after dispatch`
          : 'We deliver here'}
      </span>
    );
  }
  const notServiceable = !!res && res.pincode === values.pincode && !res.serviceable;
  const pinError =
    errors.pincode ??
    (pincode.invalid ? 'Enter a valid 6-digit pincode' : undefined) ??
    (notServiceable ? "Sorry, we don't deliver to this pincode yet." : undefined);

  return (
    <CheckoutSection step={2} title="Delivery address">
      {signedIn && (savedLoading || saved.length > 0) && (
        <fieldset className="mb-6 grid gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Saved addresses</legend>
          {savedLoading ? (
            <div role="status" aria-label="Loading saved addresses" className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : (
            <RadioGroup
              value={selectedSavedId ?? ''}
              onValueChange={(id) => {
                const a = saved.find((s) => s.id === id);
                if (a) onPickSaved(a);
              }}
              className="grid gap-2 sm:grid-cols-2"
              aria-label="Saved addresses"
            >
              {saved.map((a) => (
                <RadioCard key={a.id} value={a.id} className="items-start">
                  <RadioDot className="mt-0.5" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {a.label ?? a.fullName}
                      {a.isDefault && <Badge tone="neutral">Default</Badge>}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {[a.line1, a.line2, a.city].filter(Boolean).join(', ')} · {a.pincode}
                    </span>
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={ids.pincode} label="Pincode" required error={pinError} hint={pinHint} className="sm:col-span-2">
          <div className="relative sm:max-w-56">
            <Input
              {...fieldAria(ids.pincode, pinError, true)}
              name="postal-code"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="175101"
              maxLength={6}
              value={values.pincode}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="pr-10 tracking-[0.2em] tabular-nums"
              required
            />
            <MapPin
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4.5 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </FormField>

        <FormField
          id={ids.line1}
          label="House no., building, street"
          required
          error={errors.line1}
          className="sm:col-span-2"
        >
          <Input
            {...fieldAria(ids.line1, errors.line1, false)}
            name="address-line1"
            autoComplete="address-line1"
            value={values.line1}
            onChange={(e) => set('line1', e.target.value)}
            maxLength={200}
            required
          />
        </FormField>
        <FormField id={ids.line2} label="Area / locality" optional error={errors.line2}>
          <Input
            {...fieldAria(ids.line2, errors.line2, false)}
            name="address-line2"
            autoComplete="address-line2"
            value={values.line2}
            onChange={(e) => set('line2', e.target.value)}
            maxLength={200}
          />
        </FormField>
        <FormField id={ids.landmark} label="Landmark" optional error={errors.landmark}>
          <Input
            {...fieldAria(ids.landmark, errors.landmark, false)}
            name="landmark"
            value={values.landmark}
            onChange={(e) => set('landmark', e.target.value)}
            maxLength={120}
          />
        </FormField>
        <FormField
          id={ids.city}
          label="City"
          required
          error={errors.city}
          aside={pincode.autoFilled ? <AutoFilled /> : undefined}
        >
          <Input
            {...fieldAria(ids.city, errors.city, false)}
            name="city"
            autoComplete="address-level2"
            value={values.city}
            onChange={(e) => set('city', e.target.value)}
            maxLength={80}
            required
          />
        </FormField>
        <FormField
          id={ids.state}
          label="State"
          required
          error={errors.state}
          aside={pincode.autoFilled ? <AutoFilled /> : undefined}
        >
          <Input
            {...fieldAria(ids.state, errors.state, false)}
            name="state"
            autoComplete="address-level1"
            value={values.state}
            onChange={(e) => set('state', e.target.value)}
            maxLength={80}
            required
          />
        </FormField>
      </div>

      {notServiceable && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          Try a nearby pincode (office or family), or write to us — we&rsquo;re adding courier routes every month.
        </p>
      )}

      {signedIn && (
        <div className="mt-5 flex items-center gap-3">
          <Checkbox
            id="checkout-save-address"
            checked={values.saveAddress}
            onCheckedChange={(c) => set('saveAddress', c === true)}
          />
          <Label htmlFor="checkout-save-address" className="font-normal">
            Save this address for next time
          </Label>
        </div>
      )}
    </CheckoutSection>
  );
}

function AutoFilled() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Sparkles aria-hidden="true" className="size-3" />
      Auto-filled
    </span>
  );
}
