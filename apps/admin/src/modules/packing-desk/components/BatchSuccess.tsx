import type { Batch } from '@pk/shared';
import { Button } from '@pk/ui';
import { Check, CheckCircle2, Copy, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';

/** Batch saved → the code BIG (for the dater stamp, D-42) + Copy. */
export function BatchSuccess({
  batch,
  onAnother,
  onViewStock,
}: {
  batch: Batch;
  onAnother: () => void;
  onViewStock: () => void;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => heading.current?.focus(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(batch.batchCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the code is on screen to copy by hand */
    }
  };

  return (
    <section
      className="grid gap-5 rounded-lg border border-success/30 bg-card p-5 text-center"
      aria-labelledby="batch-success"
    >
      <CheckCircle2 aria-hidden="true" className="mx-auto size-12 text-success" />
      <h2 id="batch-success" ref={heading} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
        {t('batches.successTitle')}
      </h2>
      <div className="grid gap-2">
        <p className="text-base text-muted-foreground">{t('batches.successCodeLabel')}</p>
        <p
          data-testid="batch-code"
          className="rounded-lg border-2 border-dashed border-tertiary/50 bg-tertiary/10 px-3 py-4 font-mono text-2xl font-bold tracking-wide whitespace-nowrap text-tertiary tabular-nums min-[400px]:text-3xl sm:text-4xl"
        >
          {batch.batchCode}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mx-auto w-full max-w-xs text-base"
        onClick={() => void copy()}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? t('batches.copied') : t('batches.copy')}
      </Button>
      <p className="text-base" aria-live="polite">
        {t('batches.successDetails', {
          count: batch.initialQuantity,
          title: batch.product.title,
          date: formatCalendarDate(batch.expiryDate),
        })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" size="lg" className="w-full text-base" onClick={onAnother}>
          <Plus aria-hidden="true" />
          {t('batches.another')}
        </Button>
        <Button type="button" variant="secondary" size="lg" className="w-full text-base" onClick={onViewStock}>
          {t('batches.viewStock')}
        </Button>
      </div>
    </section>
  );
}
