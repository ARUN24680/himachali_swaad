'use client';

import type { SessionUser } from '@pk/shared';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pk/ui';
import { useState } from 'react';
import { useAccountUiStore } from '../store/account-ui.store';
import { OtpStep } from './OtpStep';
import { PhoneStep } from './PhoneStep';

type Step = { name: 'phone' } | { name: 'otp'; phone: string; resendAfterSec: number };

interface SignInDialogProps {
  onSignedIn?: (user: SessionUser) => void;
}

/**
 * Customer OTP sign-in (Phase 2 §2.7): bottom sheet on phones, centered dialog from 640px.
 * Customers sign in by phone only; guest checkout stays available without it.
 */
export function SignInDialog({ onSignedIn }: SignInDialogProps) {
  const open = useAccountUiStore((s) => s.signInOpen);
  const setOpen = useAccountUiStore((s) => s.setSignInOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent layout="sheet">
        {/* Radix unmounts content on close, so every opening starts fresh at the phone step */}
        <SignInFlow
          onDone={(user) => {
            setOpen(false);
            onSignedIn?.(user);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SignInFlow({ onDone }: { onDone: (user: SessionUser) => void }) {
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [lastPhone, setLastPhone] = useState('');

  return (
    <div className="grid gap-6">
      <DialogHeader>
        <p className="text-xs font-semibold tracking-[0.08em] text-accent-foreground uppercase">Pahadi Khatki</p>
        <DialogTitle>{step.name === 'phone' ? 'Sign in with your mobile number' : 'Enter your code'}</DialogTitle>
        <DialogDescription>
          {step.name === 'phone'
            ? 'Track your orders and check out faster next time.'
            : 'We sent a 6-digit code by SMS. It may take a few seconds to arrive.'}
        </DialogDescription>
      </DialogHeader>

      {step.name === 'phone' ? (
        <PhoneStep
          initialPhone={lastPhone}
          onSent={(phone, resendAfterSec) => {
            setLastPhone(phone);
            setStep({ name: 'otp', phone, resendAfterSec });
          }}
        />
      ) : (
        <OtpStep
          key={step.phone}
          phone={step.phone}
          resendAfterSec={step.resendAfterSec}
          onChangeNumber={() => setStep({ name: 'phone' })}
          onVerified={onDone}
        />
      )}

      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        No account needed to order — you can also check out as a guest.
      </p>
    </div>
  );
}
