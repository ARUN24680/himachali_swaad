import { SETTING_SCHEMAS, type EditableSettingKey } from '@pk/shared';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@pk/ui';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { basisPointsToPercentInput, paiseToRupeesInput, percentToBasisPoints, rupeesToPaise } from '@/lib/money-input';
import { toast } from '@/store/toast.store';
import { useUpdateSetting } from '../hooks/useSettings';
import { formatSettingValue, metaFor, type SellerDetails } from './settingMeta';

const SELLER_FIELDS: { key: keyof SellerDetails; label: string; hint?: string; className?: string }[] = [
  { key: 'legalName', label: 'Legal name', className: 'sm:col-span-2' },
  { key: 'gstin', label: 'GSTIN', hint: '15 characters, e.g. 02ABCDE1234F1Z5' },
  { key: 'stateCode', label: 'State code', hint: 'GST state code, e.g. 02 for Himachal' },
  { key: 'addressLine', label: 'Address', className: 'sm:col-span-2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code' },
];

const toText = (kind: string, value: unknown): string => {
  if (value == null) return '';
  if (kind === 'paise') return paiseToRupeesInput(value as number);
  if (kind === 'bp') return basisPointsToPercentInput(value as number);
  return String(value);
};

/**
 * Per-key editor derived from SETTING_SCHEMAS (@pk/shared) — the same Zod schema the API uses, so
 * the dialog rejects exactly what the server would. ₹ in, paise out; % in, basis points out.
 */
/**
 * What "Not decided yet" means at checkout (cart.service quoteCart): shipping is ₹0 when a threshold
 * is set and the subtotal reaches it, otherwise the flat fee — or ₹0 when no flat fee is set.
 */
const UNSET_HINT: Record<string, string> = {
  free_shipping_threshold_paise:
    'Saved as empty — no free-shipping threshold, so every order pays the flat shipping fee (₹0 if that is empty too).',
  flat_shipping_fee_paise:
    'Saved as empty — orders that don’t reach the free-shipping threshold pay ₹0 shipping (D-50).',
  seller_details: 'Invoices can’t be generated until seller details are set.',
};

export function SettingEditDialog({
  settingKey,
  value,
  description,
  onOpenChange,
}: {
  settingKey: EditableSettingKey;
  value: unknown;
  description: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = metaFor(settingKey)!;
  const schema = SETTING_SCHEMAS[settingKey];
  const update = useUpdateSetting();
  const unsetId = useId();
  const [text, setText] = useState(toText(meta.kind, value));
  const [unset, setUnset] = useState(value === null);
  const [seller, setSeller] = useState<SellerDetails>(() => ({
    legalName: '',
    gstin: '',
    addressLine: '',
    city: '',
    state: '',
    stateCode: '',
    pincode: '',
    ...((value as Partial<SellerDetails> | null) ?? {}),
  }));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const parse = (): { ok: true; value: unknown } | { ok: false; message: string } => {
    if (meta.nullable && unset) return { ok: true, value: null };
    let candidate: unknown;
    switch (meta.kind) {
      case 'paise':
        candidate = rupeesToPaise(text);
        if (candidate == null) return { ok: false, message: 'Enter an amount in rupees, e.g. 499 or 49.50' };
        break;
      case 'bp':
        candidate = percentToBasisPoints(text);
        if (candidate == null) return { ok: false, message: 'Enter a percentage, e.g. 50' };
        break;
      case 'int':
        if (!/^-?\d+$/.test(text.trim())) return { ok: false, message: 'Enter a whole number' };
        candidate = Number(text);
        break;
      case 'decimal':
        candidate = Number(text);
        if (text.trim() === '' || Number.isNaN(candidate)) return { ok: false, message: 'Enter a number' };
        break;
      case 'seller':
        candidate = {
          ...Object.fromEntries(Object.entries(seller).map(([k, v]) => [k, v.trim()])),
          gstin: seller.gstin.trim().toUpperCase(),
        };
        break;
      default:
        return { ok: false, message: 'This setting can’t be edited.' };
    }
    const r = schema.safeParse(candidate);
    if (r.success) return { ok: true, value: r.data };
    if (meta.kind === 'seller') {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
      setFieldErrors(errs);
      return { ok: false, message: 'Fix the highlighted fields.' };
    }
    const issue = r.error.issues[0];
    const min = (issue as { minimum?: number }).minimum;
    const max = (issue as { maximum?: number }).maximum;
    const human = (n: number) =>
      meta.kind === 'paise' ? formatSettingValue(settingKey, n) : meta.kind === 'bp' ? `${n / 100}%` : String(n);
    if (issue?.code === 'too_small' && min != null) return { ok: false, message: `Must be at least ${human(min)}` };
    if (issue?.code === 'too_big' && max != null) return { ok: false, message: `Must be at most ${human(max)}` };
    return { ok: false, message: issue?.message ?? 'Invalid value' };
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    const r = parse();
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setError(null);
    update.mutate(
      { key: settingKey, value: r.value },
      {
        onSuccess: () => {
          toast({ title: `${meta.label} updated`, description: formatSettingValue(settingKey, r.value) });
          onOpenChange(false);
        },
      },
    );
  };

  const prefix = meta.kind === 'paise' ? '₹' : undefined;
  const suffix = meta.kind === 'bp' ? '%' : meta.unit && !meta.unit.startsWith(':') ? meta.unit : undefined;

  return (
    <Dialog open onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet" className={meta.kind === 'seller' ? 'sm:max-w-xl' : undefined}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{meta.label}</DialogTitle>
            <DialogDescription>
              {description ?? 'Changes apply immediately and are recorded in the audit log.'}{' '}
              <span className="font-mono text-xs">{settingKey}</span>
            </DialogDescription>
          </DialogHeader>

          {meta.kind === 'seller' ? (
            <fieldset disabled={unset} className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Seller details</legend>
              {SELLER_FIELDS.map((f) => (
                <FormField key={f.key} label={f.label} hint={f.hint} error={fieldErrors[f.key]} className={f.className}>
                  <Input
                    value={seller[f.key]}
                    onChange={(e) => setSeller((s) => ({ ...s, [f.key]: e.target.value }))}
                    autoCapitalize={f.key === 'gstin' ? 'characters' : undefined}
                  />
                </FormField>
              ))}
            </fieldset>
          ) : (
            <FormField
              label="Value"
              error={error ?? undefined}
              hint={
                meta.kind === 'int' && settingKey === 'pickup_cutoff_hour_ist' ? '24-hour clock, 6–20 (IST)' : undefined
              }
            >
              <InputAffix
                prefix={prefix}
                suffix={suffix}
                inputMode={meta.kind === 'int' ? 'numeric' : 'decimal'}
                value={text}
                disabled={meta.nullable && unset}
                onChange={(e) => setText(e.target.value)}
              />
            </FormField>
          )}

          {meta.nullable && (
            <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
              <Checkbox id={unsetId} checked={unset} onCheckedChange={(c) => setUnset(c === true)} className="mt-0.5" />
              <Label htmlFor={unsetId} className="grid gap-0.5 font-normal">
                <span className="font-medium">Not decided yet</span>
                <span className="text-xs text-muted-foreground">{UNSET_HINT[settingKey] ?? 'Saved as empty.'}</span>
              </Label>
            </div>
          )}

          {meta.kind === 'seller' && error && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{error}</span>
            </Alert>
          )}
          {update.isError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{update.error.message}</span>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
