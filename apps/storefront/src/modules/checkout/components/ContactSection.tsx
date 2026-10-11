'use client';

import { Input } from '@pk/ui';
import type { ReactNode } from 'react';
import { FormField, fieldAria } from '@/components/common/FormField';
import { PhoneInput } from '@/components/common/PhoneInput';
import { fieldId, type CheckoutFormValues, type FieldErrors } from '../lib/checkout-form';
import { CheckoutSection } from './CheckoutSection';

type Setter = <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => void;

export function ContactSection({
  values,
  errors,
  set,
  aside,
}: {
  values: CheckoutFormValues;
  errors: FieldErrors;
  set: Setter;
  aside?: ReactNode;
}) {
  const name = fieldId('fullName');
  const phone = fieldId('phone');
  const email = fieldId('email');
  return (
    <CheckoutSection step={1} title="Contact" aside={aside}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={name} label="Full name" required error={errors.fullName} className="sm:col-span-2">
          <Input
            {...fieldAria(name, errors.fullName, false)}
            name="name"
            autoComplete="name"
            value={values.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            maxLength={120}
            required
          />
        </FormField>
        <FormField
          id={phone}
          label="Mobile number"
          required
          error={errors.phone}
          hint="For courier updates and to look up your order."
        >
          <PhoneInput
            {...fieldAria(phone, errors.phone, true)}
            name="phone"
            value={values.phoneDigits}
            onValueChange={(d) => set('phoneDigits', d)}
            required
          />
        </FormField>
        <FormField id={email} label="Email" optional error={errors.email} hint="For your tax invoice.">
          <Input
            {...fieldAria(email, errors.email, true)}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            maxLength={254}
          />
        </FormField>
      </div>
    </CheckoutSection>
  );
}
