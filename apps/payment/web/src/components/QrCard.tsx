import { Card, cn } from '@pk/ui';
import { BadgeCheck, ScanLine } from 'lucide-react';
import { formatINR } from '../lib/format';

interface QrCardProps {
  qrDataUrl: string;
  payeeName: string;
  payablePaise: number;
  className?: string;
}

export function QrCard({ qrDataUrl, payeeName, payablePaise, className }: QrCardProps) {
  return (
    <Card className={cn('flex flex-col items-center p-4 text-center md:justify-center md:p-8', className)}>
      <h2 className="flex items-center gap-2 text-lg font-medium text-foreground md:text-xl">
        <ScanLine className="size-5 text-accent-foreground" aria-hidden="true" />
        <span className="md:hidden">Or scan from another phone</span>
        <span className="hidden md:inline">Scan to pay</span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Scan with any UPI app — GPay, PhonePe, Paytm, BHIM</p>

      {/* Forced-light frame: QR codes need a light quiet zone to scan, even in dark mode. */}
      <div className="light mt-4 w-full max-w-64 rounded-lg border border-border bg-card p-3 md:mt-6 md:max-w-80">
        <img
          src={qrDataUrl}
          alt={`UPI QR code to pay ${formatINR(payablePaise)} to ${payeeName}`}
          width={320}
          height={320}
          className="block aspect-square h-auto w-full"
        />
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <BadgeCheck className="size-4 text-success" aria-hidden="true" />
        {payeeName}
      </p>
    </Card>
  );
}
