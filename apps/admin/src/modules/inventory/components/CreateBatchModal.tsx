import {
  BatchCreateRequestSchema,
  MAX_BATCH_QUANTITY,
  batchCodePrefix,
  formatINR,
  todayInIST,
  type BatchCreateRequest,
  type BatchProductOption,
} from '@pk/shared';
import {
  Alert,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  cn,
} from '@pk/ui';
import { AlertCircle, CalendarClock, ChevronDown, Loader2, PackagePlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { addDays, formatCalendarDate } from '@/lib/dates';
import { costPerUnitPaise, rupeesToPaise } from '@/lib/money-input';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useBatchProductOptions, useCreateBatch, usePickupLocations } from '../hooks/useBatches';

type Errors = Partial<
  Record<'productId' | 'quantity' | 'totalCost' | 'manufacturedAt' | 'pickupLocationId' | 'notes', string>
>;

const INT = /^\d+$/;

function ProductPicker({
  options,
  value,
  onChange,
  error,
}: {
  options: BatchProductOption[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">Product</legend>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        aria-label="Product"
        aria-describedby={error ? errorId : undefined}
        className="max-h-64 grid-cols-1 overflow-y-auto p-0.5 sm:grid-cols-2"
      >
        {options.map((p) => {
          const blocked = p.shelfLifeDays == null;
          return (
            <RadioCard key={p.id} value={p.id} disabled={blocked} aria-label={`${p.title} ${p.netWeightG} g`}>
              <RadioDot />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">{p.title}</span>
                <span className={cn('text-xs', blocked ? 'text-warning' : 'text-muted-foreground')}>
                  {blocked
                    ? 'Shelf life not set — ask the admin to add it'
                    : `${p.sku} · ${p.netWeightG} g${p.isActive ? '' : ' · draft'}`}
                </span>
              </span>
            </RadioCard>
          );
        })}
      </RadioGroup>
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Log a new kitchen batch (D-42): product + jars + total cost. Code, expiry and per-jar cost are
 * server-derived; we preview them so the partner can sanity-check before saving. Target: < 30 s.
 */
export function CreateBatchModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const options = useBatchProductOptions();
  const locations = usePickupLocations();
  const create = useCreateBatch();
  const today = todayInIST();

  const loggable = options.data?.filter((p) => p.shelfLifeDays != null) ?? [];
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [manufacturedAt, setManufacturedAt] = useState(today);
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const selectedId = productId || (loggable.length === 1 ? (loggable[0]?.id ?? '') : '');
  const product = options.data?.find((p) => p.id === selectedId);
  const activeLocations = locations.data?.filter((l) => l.isActive) ?? [];
  const needsLocation = activeLocations.length > 1;

  const qty = INT.test(quantity.trim()) ? Number(quantity.trim()) : null;
  const costPaise = rupeesToPaise(totalCost);
  const perJar = qty && qty > 0 && costPaise != null ? costPerUnitPaise(costPaise, qty) : null;
  const expiry =
    product?.shelfLifeDays != null && manufacturedAt ? addDays(manufacturedAt, product.shelfLifeDays) : null;
  const codePreview =
    product && /^\d{4}-\d{2}-\d{2}$/.test(manufacturedAt) ? `${batchCodePrefix(manufacturedAt, product.sku)}··` : null;

  const reset = () => {
    setProductId('');
    setQuantity('');
    setTotalCost('');
    setManufacturedAt(todayInIST());
    setPickupLocationId('');
    setNotes('');
    setMore(false);
    setErrors({});
    create.reset();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!selectedId) errs.productId = 'Choose a product';
    if (qty == null || qty < 1) errs.quantity = 'Enter the number of jars';
    else if (qty > MAX_BATCH_QUANTITY) errs.quantity = `At most ${MAX_BATCH_QUANTITY} jars per batch`;
    if (!totalCost.trim()) errs.totalCost = 'Enter the total cost of this batch';
    else if (costPaise == null) errs.totalCost = 'Enter an amount like 6000 or 6000.50';
    if (manufacturedAt > today) errs.manufacturedAt = 'Can’t be in the future';
    if (needsLocation && !pickupLocationId) errs.pickupLocationId = 'Choose the kitchen';

    const body: BatchCreateRequest = {
      productId: selectedId,
      quantity: qty ?? 0,
      totalCostPaise: costPaise ?? 0,
      ...(manufacturedAt && manufacturedAt !== today ? { manufacturedAt } : {}),
      ...(pickupLocationId ? { pickupLocationId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    if (Object.keys(errs).length === 0) {
      const parsed = BatchCreateRequestSchema.safeParse(body);
      if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0]) as keyof Errors] ??= i.message;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.manufacturedAt || errs.pickupLocationId || errs.notes) setMore(true);
      return;
    }
    create.mutate(body, {
      onSuccess: (batch) => {
        toast({
          title: `Batch ${batch.batchCode} logged`,
          description: `${batch.initialQuantity} jars of ${batch.product.title} · expires ${formatCalendarDate(batch.expiryDate)}`,
        });
        reset();
        onOpenChange(false);
      },
    });
  };

  const apiError = create.error;
  const apiMessage = apiError
    ? isApiError(apiError, 'FORBIDDEN')
      ? 'You can only log batches for your own kitchen.'
      : isApiError(apiError, 'NETWORK_ERROR')
        ? 'You seem to be offline. Nothing was saved — try again.'
        : apiError.message
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent layout="sheet" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log a new batch</DialogTitle>
          <DialogDescription>Batch code, expiry and per-jar cost are worked out for you.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="grid gap-5">
          {options.isPending ? (
            <div role="status" aria-label="Loading products" className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : options.isError ? (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>
                Couldn’t load products.{' '}
                <button type="button" className="font-semibold underline" onClick={() => void options.refetch()}>
                  Try again
                </button>
              </span>
            </Alert>
          ) : options.data.length === 0 ? (
            <Alert tone="warning">
              <AlertCircle aria-hidden="true" />
              No products to log against yet. The admin needs to add one first.
            </Alert>
          ) : (
            <ProductPicker
              options={options.data}
              value={selectedId}
              onChange={(id) => {
                setProductId(id);
                setErrors((e) => ({ ...e, productId: undefined }));
              }}
              error={errors.productId}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Jars" error={errors.quantity}>
              <Input
                inputMode="numeric"
                enterKeyHint="next"
                autoComplete="off"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value.replace(/\D/g, ''));
                  setErrors((er) => ({ ...er, quantity: undefined }));
                }}
                placeholder="e.g. 50"
                className="h-12 text-lg font-semibold tabular-nums"
              />
            </FormField>
            <FormField label="Total cost" error={errors.totalCost}>
              <InputAffix
                prefix="₹"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                value={totalCost}
                onChange={(e) => {
                  setTotalCost(e.target.value);
                  setErrors((er) => ({ ...er, totalCost: undefined }));
                }}
                placeholder="e.g. 6000"
                className="h-12 text-lg font-semibold"
              />
            </FormField>
          </div>

          <dl
            aria-live="polite"
            className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/70 p-3.5 text-sm sm:grid-cols-3"
          >
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Per jar</dt>
              <dd className="font-semibold tabular-nums">{perJar != null ? formatINR(perJar) : '—'}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                Expires
              </dt>
              <dd className="font-semibold tabular-nums">{expiry ? formatCalendarDate(expiry) : '—'}</dd>
            </div>
            <div className="col-span-2 grid gap-0.5 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">Batch code</dt>
              <dd className="font-mono text-xs font-semibold tracking-wide text-tertiary">{codePreview ?? '—'}</dd>
            </div>
          </dl>

          <div className="grid gap-4">
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((m) => !m)}
              className="flex min-h-11 items-center justify-between rounded-md text-sm font-medium text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              More options — date, {needsLocation ? 'kitchen, ' : ''}notes
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 transition-transform motion-reduce:transition-none', more && 'rotate-180')}
              />
            </button>
            {more && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Made on" error={errors.manufacturedAt} hint="Defaults to today.">
                  <Input
                    type="date"
                    max={today}
                    value={manufacturedAt}
                    onChange={(e) => setManufacturedAt(e.target.value)}
                  />
                </FormField>
                {needsLocation && (
                  <FormField label="Kitchen" error={errors.pickupLocationId}>
                    <Select value={pickupLocationId} onValueChange={setPickupLocationId}>
                      <SelectTrigger aria-label="Kitchen">
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeLocations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} · {l.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                <FormField label="Notes" optional error={errors.notes} className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Extra garlic in this lot"
                  />
                </FormField>
              </div>
            )}
          </div>

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
            <Button type="submit" disabled={create.isPending || !options.data?.length} className="sm:min-w-36">
              {create.isPending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <PackagePlus aria-hidden="true" />
              )}
              Log batch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
