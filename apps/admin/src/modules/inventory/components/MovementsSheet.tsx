import { formatINR, type Batch, type Movement } from '@pk/shared';
import {
  Badge,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  Textarea,
  cn,
} from '@pk/ui';
import { History, Loader2, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/common/StateBlocks';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { toast } from '@/store/toast.store';
import { useBatchMovements, useUpdateBatchNotes } from '../hooks/useBatches';
import { expiryText, MOVEMENT_LABEL, SHELF_LABEL } from './batchMeta';

function NotesEditor({ batch }: { batch: Batch }) {
  const [value, setValue] = useState(batch.notes ?? '');
  const save = useUpdateBatchNotes(batch.id);
  const dirty = value.trim() !== (batch.notes ?? '');
  return (
    <div className="grid gap-2">
      <label htmlFor={`notes-${batch.id}`} className="text-sm font-medium">
        Notes
      </label>
      <Textarea
        id={`notes-${batch.id}`}
        rows={2}
        maxLength={500}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Anything worth remembering about this batch"
      />
      {save.isError && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {save.error.message}
        </p>
      )}
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          className="h-11 justify-self-end"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(value.trim() ? value.trim() : null, { onSuccess: () => toast({ title: 'Notes saved' }) })
          }
        >
          {save.isPending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Save notes
        </Button>
      )}
    </div>
  );
}

function MovementRow({ m }: { m: Movement }) {
  const positive = m.quantityDelta > 0;
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-3">
      <span className="font-medium">{MOVEMENT_LABEL[m.type]}</span>
      <span className={cn('text-right font-semibold tabular-nums', positive ? 'text-success' : 'text-destructive')}>
        {positive ? '+' : '−'}
        {Math.abs(m.quantityDelta)}
      </span>
      <span className="min-w-0 text-xs text-muted-foreground">
        {formatDateTime(m.createdAt)}
        {m.actorName && ` · ${m.actorName}`}
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">bal. {m.balanceAfter}</span>
      {m.reason && <span className="col-span-2 text-sm text-foreground/90">“{m.reason}”</span>}
    </li>
  );
}

/** Batch detail + stock ledger (newest first, running balance). Right drawer / bottom sheet. */
export function MovementsSheet({
  batch,
  onOpenChange,
  onAdjust,
}: {
  batch: Batch | null;
  onOpenChange: (open: boolean) => void;
  onAdjust: (batch: Batch) => void;
}) {
  const movements = useBatchMovements(batch?.id ?? null);

  return (
    <Sheet open={batch !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        {batch && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="batch">{batch.batchCode}</Badge>
                <StatusBadge status={batch.shelfStatus} label={SHELF_LABEL[batch.shelfStatus]} />
              </div>
              <SheetTitle>{batch.product.title}</SheetTitle>
              <SheetDescription>
                {batch.pickupLocation.name} · {batch.product.netWeightG} g jars
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="grid content-start gap-6">
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3.5 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Jars left</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {batch.availableStock}{' '}
                    <span className="text-sm font-normal text-muted-foreground">/ {batch.initialQuantity}</span>
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Cost per jar</dt>
                  <dd className="text-lg font-semibold tabular-nums">{formatINR(batch.costPerUnitPaise)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Made on</dt>
                  <dd className="tabular-nums">{formatCalendarDate(batch.manufacturedAt)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Expires</dt>
                  <dd className="tabular-nums">
                    {formatCalendarDate(batch.expiryDate)}
                    <span className="block text-xs text-muted-foreground">{expiryText(batch.daysToExpiry)}</span>
                  </dd>
                </div>
                <div className="col-span-2 grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Total cost</dt>
                  <dd className="tabular-nums">{formatINR(batch.totalCostPaise)}</dd>
                </div>
              </dl>

              <NotesEditor key={batch.id} batch={batch} />

              <section aria-labelledby={`ledger-${batch.id}`} className="grid gap-1">
                <h3 id={`ledger-${batch.id}`} className="flex items-center gap-2 font-serif text-lg font-medium">
                  <History aria-hidden="true" className="size-4 text-muted-foreground" />
                  Stock ledger
                </h3>
                {movements.isPending ? (
                  <div role="status" aria-label="Loading ledger" className="grid gap-3 py-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="grid gap-1.5">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : movements.isError ? (
                  <ErrorState
                    title="Couldn’t load the ledger"
                    message={movements.error.message}
                    onRetry={() => void movements.refetch()}
                    retrying={movements.isFetching}
                  />
                ) : movements.data.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No movements recorded yet.</p>
                ) : (
                  <ol className="divide-y divide-border" aria-label="Movements, newest first">
                    {movements.data.map((m) => (
                      <MovementRow key={m.id} m={m} />
                    ))}
                  </ol>
                )}
              </section>
            </SheetBody>
            <SheetFooter>
              <Button asChild variant="ghost">
                <Link to={`/batches/${batch.id}/ledger`}>
                  <History aria-hidden="true" />
                  Full ledger
                </Link>
              </Button>
              <Button variant="outline" onClick={() => onAdjust(batch)}>
                <SlidersHorizontal aria-hidden="true" />
                Adjust stock
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
