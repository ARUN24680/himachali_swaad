import { Card, cn } from '@pk/ui';
import { ShieldCheck } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface PayeeCardProps {
  payeeName: string;
  payeeVpa: string;
  className?: string;
}

export function PayeeCard({ payeeName, payeeVpa, className }: PayeeCardProps) {
  return (
    <Card className={cn('p-4 md:p-6', className)}>
      <h2 className="text-lg font-medium text-foreground">Payee details</h2>
      <dl className="mt-2 divide-y divide-border">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Paying to</dt>
            <dd className="font-medium break-words text-foreground">{payeeName}</dd>
          </div>
          <CopyButton value={payeeName} label="payee name" />
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">UPI ID</dt>
            <dd className="font-medium break-all text-foreground">{payeeVpa}</dd>
          </div>
          <CopyButton value={payeeVpa} label="UPI ID" />
        </div>
      </dl>
      <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Your UPI app should show <span className="font-medium text-foreground">{payeeName}</span> as the payee. We
          will never ask for your UPI PIN.
        </span>
      </p>
    </Card>
  );
}
