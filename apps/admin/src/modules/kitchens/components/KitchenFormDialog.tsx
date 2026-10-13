import { KitchenCreateRequestSchema, type KitchenRow, type KitchenUpdateRequest } from '@pk/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from '@pk/ui';
import { AlertCircle, AlertTriangle, Loader2, Truck, Users } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { localPhone, normalisePhone } from '@/lib/phone';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useCreateKitchen, useUpdateKitchen } from '../hooks/useKitchens';

type Field =
  | 'code'
  | 'name'
  | 'contactName'
  | 'contactPhone'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'pincode'
  | 'shiprocketPickupName'
  | 'fssaiLicenseNo';
type Form = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;
const FIELDS = new Set<string>([
  'code',
  'name',
  'contactName',
  'contactPhone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'pincode',
  'shiprocketPickupName',
  'fssaiLicenseNo',
]);

/** Everything except `code` — the edit form validates against this (the code never changes). */
const EditableSchema = KitchenCreateRequestSchema.omit({ code: true });

const fromRow = (k: KitchenRow | null): Form => ({
  code: k?.code ?? '',
  name: k?.name ?? '',
  contactName: k?.contactName ?? '',
  contactPhone: localPhone(k?.contactPhone),
  addressLine1: k?.addressLine1 ?? '',
  addressLine2: k?.addressLine2 ?? '',
  city: k?.city ?? '',
  state: k?.state ?? 'Himachal Pradesh',
  pincode: k?.pincode ?? '',
  shiprocketPickupName: k?.shiprocketPickupName ?? '',
  fssaiLicenseNo: k?.fssaiLicenseNo ?? '',
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Trimmed request body; empty optional fields → null. */
const toBody = (f: Form) => ({
  name: f.name.trim(),
  contactName: f.contactName.trim(),
  contactPhone: normalisePhone(f.contactPhone) ?? '',
  addressLine1: f.addressLine1.trim(),
  addressLine2: orNull(f.addressLine2),
  city: f.city.trim(),
  state: f.state.trim(),
  pincode: f.pincode.trim(),
  shiprocketPickupName: orNull(f.shiprocketPickupName),
  fssaiLicenseNo: orNull(f.fssaiLicenseNo.replace(/\s/g, '')),
});

/** API 400 `details.issues[].path` ("/fssaiLicenseNo", "/body/pincode") → per-field messages. */
function serverFieldErrors(err: unknown): Errors {
  if (!isApiError(err) || err.status !== 400) return {};
  const issues = err.details?.issues;
  if (!Array.isArray(issues)) return {};
  const out: Errors = {};
  for (const i of issues as { path?: unknown; message?: unknown }[]) {
    const key = String(i.path ?? '')
      .split('/')
      .filter(Boolean)
      .at(-1);
    if (key && FIELDS.has(key)) out[key as Field] ??= typeof i.message === 'string' ? i.message : 'Check this field';
  }
  return out;
}

function Section({ title, children, description }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-1 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</legend>
      {description}
      {children}
    </fieldset>
  );
}

/** Add / edit a kitchen (pickup location). Code is fixed once created; deactivating keeps existing stock selling. */
export function KitchenFormDialog({
  kitchen,
  onOpenChange,
}: {
  kitchen: KitchenRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateKitchen();
  const update = useUpdateKitchen(kitchen?.id ?? '');
  const m = kitchen ? update : create;
  const activeId = useId();
  const [form, setForm] = useState<Form>(() => fromRow(kitchen));
  const [isActive, setIsActive] = useState(kitchen?.isActive ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: Field, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: Field) => errors[k];

  const done = (title: string, description?: string) => {
    toast({ title, description });
    onOpenChange(false);
  };
  const onError = (e: unknown) => {
    const fields = serverFieldErrors(e);
    // Edit can only collide on the pickup name (the code is fixed)
    if (kitchen && isApiError(e, 'DUPLICATE')) fields.shiprocketPickupName = e.message;
    setErrors(fields);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = toBody(form);
    const parsed = kitchen
      ? EditableSchema.safeParse(body)
      : KitchenCreateRequestSchema.safeParse({ ...body, code: form.code });
    const errs: Errors = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0]) as Field] ??= i.message;
    setErrors(errs);
    if (!parsed.success) return;

    if (!kitchen) {
      create.mutate(KitchenCreateRequestSchema.parse({ ...body, code: form.code }), {
        onSuccess: (k) =>
          done(
            `${k.name} added`,
            k.shiprocketPickupName
              ? 'Assign a kitchen partner to it from the Staff page.'
              : 'Add the Shiprocket pickup name before orders from this kitchen are packed.',
          ),
        onError,
      });
      return;
    }
    // PATCH only what changed
    const before = toBody(fromRow(kitchen));
    const patch: KitchenUpdateRequest = {};
    for (const [k, v] of Object.entries(body) as [keyof typeof body, string | null][]) {
      if (v !== before[k]) Object.assign(patch, { [k]: v });
    }
    if (isActive !== kitchen.isActive) patch.isActive = isActive;
    if (Object.keys(patch).length === 0) return onOpenChange(false);
    update.mutate(patch, {
      onSuccess: (k) =>
        done(
          `${k.name} updated`,
          patch.isActive === false
            ? 'Deactivated — no new batches can be added; existing stock still sells.'
            : patch.isActive === true
              ? 'Active again — new batches can be added.'
              : undefined,
        ),
      onError,
    });
  };

  const formError =
    m.isError && Object.keys(serverFieldErrors(m.error)).length === 0 && !(kitchen && isApiError(m.error, 'DUPLICATE'))
      ? isApiError(m.error, 'NETWORK_ERROR')
        ? 'Can’t reach the server. Check your connection and try again.'
        : m.error.message
      : null;
  const pickupMissing = !form.shiprocketPickupName.trim();

  return (
    <Dialog open onOpenChange={(o) => !m.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet" className="sm:max-w-2xl" data-testid="kitchen-dialog">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{kitchen ? `Edit ${kitchen.name}` : 'Add a kitchen'}</DialogTitle>
            <DialogDescription>
              {kitchen ? (
                <>
                  Code <span className="font-mono font-medium text-foreground">{kitchen.code}</span> — the code can’t be
                  changed.
                </>
              ) : (
                'A kitchen is the address the courier collects packed orders from. Batches and orders are tied to it.'
              )}
            </DialogDescription>
          </DialogHeader>

          <Section title="Kitchen">
            <div className="grid gap-3 sm:grid-cols-2">
              {!kitchen && (
                <FormField label="Code" hint="Capital letters, digits and dashes, e.g. HP-MANDI-01" error={err('code')}>
                  <Input
                    value={form.code}
                    onChange={(e) => set('code', e.target.value.toUpperCase())}
                    className="font-mono uppercase"
                    autoComplete="off"
                    maxLength={40}
                  />
                </FormField>
              )}
              <FormField label="Name" hint="Shown to staff, e.g. Mandi Kitchen" error={err('name')}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
              </FormField>
            </div>
          </Section>

          <Section title="Shiprocket & compliance">
            <Alert tone={pickupMissing ? 'warning' : 'info'} data-testid="pickup-name-hint">
              <Truck aria-hidden="true" />
              <p className="min-w-0">
                <span className="font-semibold">
                  Must match the pickup address nickname in Shiprocket exactly — without it orders from this kitchen
                  can’t be booked.
                </span>{' '}
                Find it in Shiprocket → Settings → Pickup addresses (same spelling, spaces and capitals).
              </p>
            </Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Shiprocket pickup name"
                optional
                hint={pickupMissing ? 'Not linked yet — courier booking will fail' : undefined}
                error={err('shiprocketPickupName')}
              >
                <Input
                  value={form.shiprocketPickupName}
                  onChange={(e) => set('shiprocketPickupName', e.target.value)}
                  autoComplete="off"
                  maxLength={60}
                />
              </FormField>
              <FormField
                label="FSSAI licence no."
                optional
                hint="14 digits — this kitchen’s own licence"
                error={err('fssaiLicenseNo')}
              >
                <Input
                  value={form.fssaiLicenseNo}
                  onChange={(e) => set('fssaiLicenseNo', e.target.value)}
                  inputMode="numeric"
                  className="font-mono tabular-nums"
                  autoComplete="off"
                  maxLength={20}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Pickup address">
            <FormField label="Address line 1" error={err('addressLine1')}>
              <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} maxLength={200} />
            </FormField>
            <FormField label="Address line 2" optional error={err('addressLine2')}>
              <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} maxLength={200} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="City" error={err('city')}>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={80} />
              </FormField>
              <FormField label="State" error={err('state')}>
                <Input value={form.state} onChange={(e) => set('state', e.target.value)} maxLength={80} />
              </FormField>
              <FormField label="PIN code" error={err('pincode')}>
                <Input
                  value={form.pincode}
                  onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  className="tabular-nums"
                  autoComplete="off"
                />
              </FormField>
            </div>
          </Section>

          <Section title="Contact at the kitchen">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Contact name" hint="The courier asks for this person" error={err('contactName')}>
                <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} />
              </FormField>
              <FormField label="Contact mobile" error={err('contactPhone')}>
                <InputAffix
                  prefix="+91"
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) => set('contactPhone', e.target.value)}
                  className="pl-12"
                />
              </FormField>
            </div>
          </Section>

          {kitchen && (
            <div className="grid gap-3">
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <Label htmlFor={activeId} className="grid gap-0.5 font-normal">
                  <span className="font-medium">Active</span>
                  <span className="text-xs text-muted-foreground">
                    Inactive: no new batches can be added; existing stock still sells.
                  </span>
                </Label>
                <Switch id={activeId} checked={isActive} onCheckedChange={setIsActive} />
              </div>
              {kitchen.isActive && !isActive && (
                <Alert tone="warning">
                  <AlertTriangle aria-hidden="true" />
                  <span>
                    Jars already in stock here keep selling and shipping. Partners can’t log new batches for this
                    kitchen until you switch it back on.
                  </span>
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Users aria-hidden="true" className="size-4 shrink-0" />
                  {kitchen.partnerCount === 0
                    ? 'No kitchen partner assigned yet.'
                    : `${kitchen.partnerCount} kitchen partner${kitchen.partnerCount === 1 ? '' : 's'} assigned.`}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link to="/staff?role=KITCHEN_PARTNER">Assign on Staff page</Link>
                </Button>
              </div>
            </div>
          )}

          {formError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{formError}</span>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {kitchen ? 'Save changes' : 'Add kitchen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
