import {
  BatchCreateRequestSchema,
  MAX_BATCH_QUANTITY,
  formatINR,
  todayInIST,
  type Batch,
  type BatchCreateRequest,
} from '@pk/shared';
import { Alert, Button, Input, RadioCard, RadioDot, RadioGroup, Skeleton, Textarea, cn } from '@pk/ui';
import { AlertCircle, ChevronDown, Loader2, PackagePlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { useT, type DeskKey } from '@/i18n';
import { addDays, formatCalendarDate } from '@/lib/dates';
import { costPerUnitPaise, rupeesToPaise } from '@/lib/money-input';
import { useBatchProductOptions, useCreateBatch, usePickupLocations } from '@/modules/inventory';
import { isApiError } from '@/services/api/http';

type Field = 'productId' | 'quantity' | 'totalCost' | 'manufacturedAt' | 'pickupLocationId';
type Errors = Partial<Record<Field, { key: DeskKey; vars?: Record<string, number> }>>;

const INT = /^\d+$/;

/**
 * Mobile batch logger (D-42, Phase 7 §7.8): big product buttons, jars, total cost — under 30 s.
 * Code, expiry and per-jar cost are server-derived; we preview per-jar cost and expiry.
 */
export function BatchLoggerForm({ onLogged }: { onLogged: (batch: Batch) => void }) {
  const t = useT();
  const options = useBatchProductOptions();
  const locations = usePickupLocations();
  const create = useCreateBatch();
  const today = todayInIST();
  const moreId = useId();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [manufacturedAt, setManufacturedAt] = useState(today);
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const loggable = options.data?.filter((p) => p.shelfLifeDays != null) ?? [];
  const selectedId = productId || (loggable.length === 1 ? (loggable[0]?.id ?? '') : '');
  const product = options.data?.find((p) => p.id === selectedId);
  const kitchens = locations.data?.filter((l) => l.isActive) ?? [];
  const needsKitchen = kitchens.length > 1;

  const qty = INT.test(quantity) ? Number(quantity) : null;
  const costPaise = rupeesToPaise(totalCost);
  const perJar = qty && qty > 0 && costPaise != null ? costPerUnitPaise(costPaise, qty) : null;
  const expiry =
    product?.shelfLifeDays != null && manufacturedAt ? addDays(manufacturedAt, product.shelfLifeDays) : null;

  const err = (f: Field) => (errors[f] ? t(errors[f].key, errors[f].vars) : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!selectedId) errs.productId = { key: 'batches.errProduct' };
    if (qty == null || qty < 1) errs.quantity = { key: 'batches.errJars' };
    else if (qty > MAX_BATCH_QUANTITY) errs.quantity = { key: 'batches.errJarsMax', vars: { max: MAX_BATCH_QUANTITY } };
    if (!totalCost.trim()) errs.totalCost = { key: 'batches.errCost' };
    else if (costPaise == null) errs.totalCost = { key: 'batches.errCostInvalid' };
    if (manufacturedAt > today) errs.manufacturedAt = { key: 'batches.errFuture' };
    if (needsKitchen && !pickupLocationId) errs.pickupLocationId = { key: 'batches.errKitchen' };

    const body: BatchCreateRequest = {
      productId: selectedId,
      quantity: qty ?? 0,
      totalCostPaise: costPaise ?? 0,
      ...(manufacturedAt && manufacturedAt !== today ? { manufacturedAt } : {}),
      ...(pickupLocationId ? { pickupLocationId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    if (Object.keys(errs).length === 0 && !BatchCreateRequestSchema.safeParse(body).success)
      errs.quantity = { key: 'batches.errGeneric' };
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.manufacturedAt) setMore(true);
      return;
    }
    create.mutate(body, { onSuccess: (batch) => onLogged(batch) });
  };

  const apiError = create.error;
  const apiKey: DeskKey | null = apiError
    ? isApiError(apiError, 'FORBIDDEN')
      ? 'batches.errForbidden'
      : isApiError(apiError, 'NETWORK_ERROR')
        ? 'batches.errOffline'
        : 'batches.errGeneric'
    : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 rounded-lg border border-border bg-card p-4">
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-serif text-xl font-semibold">{t('batches.productLegend')}</legend>
        {options.isPending ? (
          <div role="status" aria-label={t('batches.productLoading')} className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : options.isError ? (
          <Alert tone="destructive" className="text-base">
            <AlertCircle aria-hidden="true" />
            <span className="grid gap-2">
              {t('batches.productError')}
              <Button type="button" variant="outline" className="w-fit" onClick={() => void options.refetch()}>
                {t('common.retry')}
              </Button>
            </span>
          </Alert>
        ) : options.data.length === 0 ? (
          <Alert tone="warning" className="text-base">
            <AlertCircle aria-hidden="true" />
            {t('batches.noProducts')}
          </Alert>
        ) : (
          <RadioGroup
            value={selectedId}
            onValueChange={(id) => {
              setProductId(id);
              setErrors((e) => ({ ...e, productId: undefined }));
            }}
            aria-label={t('batches.productLegend')}
            className="grid-cols-2"
          >
            {options.data.map((p) => {
              const blocked = p.shelfLifeDays == null;
              return (
                <RadioCard
                  key={p.id}
                  value={p.id}
                  disabled={blocked}
                  aria-label={t('batches.productOption', { title: p.title, g: p.netWeightG })}
                  className="min-h-20 items-start p-3"
                >
                  <RadioDot className="mt-1" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-base leading-snug font-semibold">{p.title}</span>
                    <span className="text-lg font-bold tabular-nums">{t('card.weight', { g: p.netWeightG })}</span>
                    {blocked && <span className="text-sm text-warning">{t('batches.noShelfLife')}</span>}
                  </span>
                </RadioCard>
              );
            })}
          </RadioGroup>
        )}
        {errors.productId && <p className="text-base font-medium text-destructive">{err('productId')}</p>}
      </fieldset>

      {needsKitchen && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-base font-semibold">{t('batches.kitchen')}</legend>
          <RadioGroup
            value={pickupLocationId}
            onValueChange={setPickupLocationId}
            aria-label={t('batches.kitchen')}
            className="sm:grid-cols-2"
          >
            {kitchens.map((k) => (
              <RadioCard key={k.id} value={k.id} className="min-h-14 text-base">
                <RadioDot />
                {k.name} · {k.city}
              </RadioCard>
            ))}
          </RadioGroup>
          {errors.pickupLocationId && (
            <p className="text-base font-medium text-destructive">{err('pickupLocationId')}</p>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('batches.jars')} error={err('quantity')}>
          <Input
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value.replace(/\D/g, ''));
              setErrors((er) => ({ ...er, quantity: undefined }));
            }}
            placeholder={t('batches.jarsPlaceholder')}
            className="h-14 text-2xl font-semibold tabular-nums"
          />
        </FormField>
        <FormField label={t('batches.cost')} error={err('totalCost')} hint={t('batches.costHelp')}>
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
            placeholder={t('batches.costPlaceholder')}
            className="h-14 text-2xl font-semibold"
          />
        </FormField>
      </div>

      <dl aria-live="polite" className="grid grid-cols-2 gap-3 rounded-lg bg-muted/70 p-4 text-base">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">{t('batches.perJar')}</dt>
          <dd className="text-lg font-bold tabular-nums">{perJar != null ? formatINR(perJar) : '—'}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">{t('batches.expires')}</dt>
          <dd className="text-lg font-bold tabular-nums">{expiry ? formatCalendarDate(expiry) : '—'}</dd>
        </div>
      </dl>

      <div className="grid gap-4">
        <button
          type="button"
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore((m) => !m)}
          className="flex min-h-11 items-center justify-between rounded-md text-base font-medium text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('batches.more')}
          <ChevronDown
            aria-hidden="true"
            className={cn('size-5 transition-transform motion-reduce:transition-none', more && 'rotate-180')}
          />
        </button>
        {more && (
          <div id={moreId} className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('batches.madeOn')} error={err('manufacturedAt')} hint={t('batches.madeOnHelp')}>
              <Input
                type="date"
                max={today}
                value={manufacturedAt}
                onChange={(e) => setManufacturedAt(e.target.value)}
                className="h-12 text-base"
              />
            </FormField>
            <FormField label={t('batches.notes')} className="sm:col-span-2">
              <Textarea
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('batches.notesPlaceholder')}
                className="text-base"
              />
            </FormField>
          </div>
        )}
      </div>

      {apiKey && (
        <Alert tone="destructive" className="text-base">
          <AlertCircle aria-hidden="true" />
          {t(apiKey)}
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-14 w-full text-lg"
        disabled={create.isPending || !options.data?.length}
      >
        {create.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <PackagePlus aria-hidden="true" />
        )}
        {t('batches.save')}
      </Button>
    </form>
  );
}
