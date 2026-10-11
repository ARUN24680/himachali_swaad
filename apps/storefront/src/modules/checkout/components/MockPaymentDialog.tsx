'use client';

import { formatINR } from '@pk/shared/money';
import { Alert, Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pk/ui';
import { AlertCircle, CheckCircle2, FlaskConical, Loader2, LogOut, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MockOutcome, PaymentController } from '../hooks/usePayment';

/**
 * Dev/CI stand-in for the Razorpay modal (gateway `mock`; the backend refuses it in production).
 * Deliberately looks like a test tool — "Test mode" badge, "no real money" in the title — so it
 * can never be mistaken for a real payment screen.
 */
export function MockPaymentDialog({ payment }: { payment: PaymentController }) {
  const { mock, session } = payment;
  const busy = mock.busy !== null;
  return (
    <Dialog open={mock.open} onOpenChange={(open) => !open && !busy && mock.close()}>
      <DialogContent layout="sheet" closeLabel="Close test payment" data-testid="mock-payment">
        <DialogHeader>
          <Badge tone="warning" className="w-fit">
            <FlaskConical aria-hidden="true" className="size-3.5" />
            Test mode
          </Badge>
          <DialogTitle>Test payment (no real money)</DialogTitle>
          <DialogDescription>
            This store is running with the mock payment gateway. Pick what the &ldquo;bank&rdquo; should do with{' '}
            <span className="font-medium text-foreground tabular-nums">
              {session ? formatINR(session.amountPaise, { trimZeroPaise: true }) : ''}
            </span>{' '}
            for order <span className="font-mono font-medium text-foreground">{session?.orderCode}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          <MockButton
            outcome="success"
            busy={mock.busy}
            onPick={mock.pick}
            icon={<CheckCircle2 className="text-success" />}
            title="Pay successfully"
            hint="Signs the payment and verifies it, like Razorpay's success handler."
          />
          <MockButton
            outcome="failure"
            busy={mock.busy}
            onPick={mock.pick}
            icon={<XCircle className="text-destructive" />}
            title="Fail payment"
            hint="The bank declines — you land on the retry state."
          />
          <MockButton
            outcome="close-browser"
            busy={mock.busy}
            onPick={mock.pick}
            icon={<LogOut className="text-info" />}
            title="Pay, then close browser"
            hint="Payment captured but never verified here — only the webhook confirms."
          />
        </div>

        {mock.error && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            <span>{mock.error}</span>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MockButton({
  outcome,
  busy,
  onPick,
  icon,
  title,
  hint,
}: {
  outcome: MockOutcome;
  busy: MockOutcome | null;
  onPick: (o: MockOutcome) => void;
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy !== null}
      onClick={() => onPick(outcome)}
      aria-label={title}
      className="h-auto min-h-14 justify-start gap-3 px-4 py-3 text-left whitespace-normal [&_svg]:size-5"
    >
      {busy === outcome ? <Loader2 aria-hidden="true" className="animate-spin" /> : icon}
      <span className="grid gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-xs font-normal tracking-normal text-muted-foreground">{hint}</span>
      </span>
    </Button>
  );
}
