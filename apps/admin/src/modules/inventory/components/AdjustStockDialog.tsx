import { AdjustmentRequestSchema, type AdjustmentRequest, type Batch } from '@pk/shared';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RadioCard,
  RadioDot,
  RadioGroup,
  Textarea,
  cn,
} from '@pk/ui';
import { AlertCircle, ArrowRight, Loader2, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useAdjustBatch } from '../hooks/useBatches';

type Kind = 'WASTAGE' | 'ADD' | 'REMOVE';

const KINDS: { value: Kind; title: string; hint: string }[] = [
  { value: 'WASTAGE', title: 'Wastage', hint: 'Broken, leaked or spoiled jars' },
  { value: 'REMOVE', title: 'Correct down', hint: 'Fewer jars than recorded' },
  { value: 'ADD', title: 'Correct up', hint: 'More jars than recorded' },
];

const WASTAGE_REASONS = ['Broken jar', 'Seal failed / leaked', 'Spoiled', 'Tasting sample'];

/** Every stock change is a ledger movement (no direct edits) — Phase 3 §3.5. */
export function AdjustStockDialog({
  batch,
  open,
  onOpenChange,
}: {
  batch: Batch;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const adjust = useAdjustBatch(batch.id);
  const [kind, setKind] = useState<Kind>('WASTAGE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  const n = /^\d+$/.test(amount) ? Number(amount) : 0;
  const delta = kind === 'ADD' ? n : -n;
  const after = batch.availableStock + delta;
  const outOfBounds = n > 0 && (after < 0 || after > batch.initialQuantity);

  const reset = () => {
    setKind('WASTAGE');
    setAmount('');
    setReason('');
    setErrors({});
    adjust.reset();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (n < 1) errs.amount = 'Enter how many jars';
    else if (after < 0) errs.amount = `Only ${batch.availableStock} jars left in this batch`;
    else if (after > batch.initialQuantity) errs.amount = `Can’t go above the ${batch.initialQuantity} jars produced`;
    const body: AdjustmentRequest = {
      type: kind === 'WASTAGE' ? 'WASTAGE' : 'ADJUSTMENT',
      quantityDelta: delta,
      reason: reason.trim(),
    };
    const parsed = AdjustmentRequestSchema.safeParse(body);
    if (!parsed.success)
      for (const i of parsed.error.issues) {
        if (i.path[0] === 'reason') errs.reason ??= i.message;
        else errs.amount ??= i.message;
      }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    adjust.mutate(body, {
      onSuccess: (b) => {
        toast({
          title: kind === 'WASTAGE' ? `${n} jar${n === 1 ? '' : 's'} written off` : 'Stock corrected',
          description: `${b.batchCode} now has ${b.availableStock} jars.`,
        });
        reset();
        onOpenChange(false);
      },
    });
  };

  const apiMessage = adjust.error
    ? isApiError(adjust.error, 'INSUFFICIENT_STOCK')
      ? 'Stock changed since you opened this (an order may have reserved jars). Check the ledger and try again.'
      : adjust.error.message
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent layout="sheet">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge tone="batch">{batch.batchCode}</Badge>
            <span>{batch.product.title}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">What happened?</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as Kind)} aria-label="What happened?">
              {KINDS.map((k) => (
                <RadioCard key={k.value} value={k.value}>
                  <RadioDot />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{k.title}</span>
                    <span className="text-xs text-muted-foreground">{k.hint}</span>
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          </fieldset>

          <FormField label={kind === 'ADD' ? 'Jars to add' : 'Jars to remove'} error={errors.amount}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, ''));
                setErrors((er) => ({ ...er, amount: undefined }));
              }}
              placeholder="e.g. 2"
              className="h-12 text-lg font-semibold tabular-nums"
            />
          </FormField>

          <div
            aria-live="polite"
            className={cn(
              'flex items-center justify-center gap-3 rounded-lg p-3 text-sm tabular-nums',
              outOfBounds ? 'bg-destructive/10 text-destructive' : 'bg-muted/70',
            )}
          >
            <span>
              <span className="text-muted-foreground">Now</span> <strong>{batch.availableStock}</strong>
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {delta > 0 ? (
                <Plus aria-hidden="true" className="size-3.5" />
              ) : (
                <Minus aria-hidden="true" className="size-3.5" />
              )}
              {n}
            </span>
            <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">After</span> <strong>{after}</strong>
              <span className="text-muted-foreground"> / {batch.initialQuantity}</span>
            </span>
          </div>

          <FormField label="Reason" error={errors.reason} hint="Kept in the stock ledger for audits.">
            <Textarea
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErrors((er) => ({ ...er, reason: undefined }));
              }}
              placeholder={kind === 'WASTAGE' ? 'Broken jar' : 'Recount after packing'}
            />
          </FormField>
          {kind === 'WASTAGE' && (
            <div className="-mt-3 flex flex-wrap gap-2" role="group" aria-label="Common reasons">
              {WASTAGE_REASONS.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 rounded-full"
                  onClick={() => setReason(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          )}

          {apiMessage && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              {apiMessage}
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={kind === 'WASTAGE' ? 'destructive' : 'primary'} disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {kind === 'WASTAGE' ? 'Write off jars' : 'Save correction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
