import {
  StaffCreateRequestSchema,
  type PickupLocationSummary,
  type StaffCreateRequest,
  type StaffRow,
} from '@pk/shared';
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
  RadioCard,
  RadioDot,
  RadioGroup,
  Switch,
} from '@pk/ui';
import { AlertCircle, KeyRound, Loader2, LogOut } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { toast } from '@/store/toast.store';
import { useCreateStaff, useUpdateStaff } from '../hooks/useStaff';

/** '98765 43210' / '+91 98765…' → '+919876543210'; '' → undefined. */
export function normalisePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return raw.trim();
}
const localPhone = (e164: string | null) => (e164 ? e164.replace(/^\+91/, '') : '');

/** 16 chars from an unambiguous alphabet — shown once, the person changes it after first login. */
function tempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function KitchenPicker({
  kitchens,
  value,
  onChange,
  error,
}: {
  kitchens: PickupLocationSummary[] | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const base = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">Kitchens</legend>
      {!kitchens ? (
        <p className="text-sm text-muted-foreground">Loading kitchens…</p>
      ) : kitchens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No kitchens set up yet.</p>
      ) : (
        kitchens.map((k) => {
          const id = `${base}-${k.id}`;
          const checked = value.includes(k.id);
          return (
            <div key={k.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(c) => onChange(c === true ? [...value, k.id] : value.filter((x) => x !== k.id))}
              />
              <Label htmlFor={id} className="flex-1 cursor-pointer py-2 font-normal">
                <span className="font-medium">{k.name}</span>{' '}
                <span className="text-muted-foreground">
                  · {k.code} · {k.city}
                  {!k.isActive && ' · inactive'}
                </span>
              </Label>
            </div>
          );
        })
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </fieldset>
  );
}

export function CreateStaffDialog({
  kitchens,
  onOpenChange,
}: {
  kitchens: PickupLocationSummary[] | undefined;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateStaff();
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    role: 'KITCHEN_PARTNER' as StaffCreateRequest['role'],
    password: tempPassword(),
    pickupLocationIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, email: form.email.trim().toLowerCase(), phone: normalisePhone(form.phone) };
    const r = StaffCreateRequestSchema.safeParse(body);
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    if (form.role === 'KITCHEN_PARTNER' && form.pickupLocationIds.length === 0)
      errs.pickupLocationIds = 'A kitchen partner needs at least one kitchen';
    setErrors(errs);
    if (!r.success || Object.keys(errs).length) return;
    create.mutate(r.data, {
      onSuccess: () => {
        toast({
          title: `${form.fullName} added`,
          description: 'Share the temporary password privately — they change it after first login.',
        });
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet" className="sm:max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a staff member</DialogTitle>
            <DialogDescription>
              Admins run the whole business; kitchen partners see only their kitchen’s packing desk, batches and
              settlements.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Role</legend>
            <RadioGroup
              value={form.role}
              onValueChange={(v) => set('role', v as typeof form.role)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  ['KITCHEN_PARTNER', 'Kitchen partner', 'Packing desk + own statements'],
                  ['ADMIN', 'Admin', 'Everything, with 2FA'],
                ] as const
              ).map(([value, label, hint]) => (
                <RadioCard key={value} value={value} aria-label={label}>
                  <RadioDot />
                  <span className="grid">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Full name" error={errors.fullName}>
              <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="off" />
            </FormField>
            <FormField label="Work email" error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Mobile" optional hint="For WhatsApp alerts" error={errors.phone}>
              <InputAffix
                prefix="+91"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="pl-12"
              />
            </FormField>
            <FormField
              label="Temporary password"
              hint="At least 12 characters"
              error={errors.password}
              aside={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
                  onClick={() => set('password', tempPassword())}
                >
                  <KeyRound aria-hidden="true" className="size-3.5" />
                  New
                </button>
              }
            >
              <Input
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className="font-mono"
                autoComplete="new-password"
              />
            </FormField>
          </div>
          <KitchenPicker
            kitchens={kitchens}
            value={form.pickupLocationIds}
            onChange={(ids) => set('pickupLocationIds', ids)}
            error={errors.pickupLocationIds}
          />
          {create.isError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{create.error.message}</span>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Add staff member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStaffDialog({
  member,
  kitchens,
  isSelf,
  onOpenChange,
}: {
  member: StaffRow;
  kitchens: PickupLocationSummary[] | undefined;
  isSelf: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateStaff(member.id);
  const forceLogout = useUpdateStaff(member.id);
  const activeId = useId();
  const [fullName, setFullName] = useState(member.fullName ?? '');
  const [phone, setPhone] = useState(localPhone(member.phone));
  const [isActive, setIsActive] = useState(member.isActive);
  const [kitchenIds, setKitchenIds] = useState(member.pickupLocationIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmLogout, setConfirmLogout] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (fullName.trim().length < 2) errs.fullName = 'Enter the full name';
    const p = normalisePhone(phone);
    if (p && !/^\+91[6-9]\d{9}$/.test(p)) errs.phone = 'Enter a valid Indian mobile number';
    if (member.role === 'KITCHEN_PARTNER' && kitchenIds.length === 0)
      errs.kitchens = 'A kitchen partner needs at least one kitchen';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    update.mutate(
      {
        fullName: fullName.trim(),
        phone: p ?? null,
        isActive,
        ...(member.role === 'KITCHEN_PARTNER' ? { pickupLocationIds: kitchenIds } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: `${fullName.trim()} updated` });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
        <DialogContent layout="sheet" className="sm:max-w-xl">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Edit {member.fullName ?? member.email}</DialogTitle>
              <DialogDescription>{member.email}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Full name" error={errors.fullName}>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </FormField>
              <FormField label="Mobile" optional error={errors.phone}>
                <InputAffix
                  prefix="+91"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-12"
                />
              </FormField>
            </div>
            {member.role === 'KITCHEN_PARTNER' && (
              <KitchenPicker kitchens={kitchens} value={kitchenIds} onChange={setKitchenIds} error={errors.kitchens} />
            )}
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <Label htmlFor={activeId} className="grid gap-0.5 font-normal">
                <span className="font-medium">Active</span>
                <span className="text-xs text-muted-foreground">
                  {isSelf ? 'You can’t deactivate your own account.' : 'Inactive staff can’t sign in.'}
                </span>
              </Label>
              <Switch id={activeId} checked={isActive} disabled={isSelf} onCheckedChange={setIsActive} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-3 text-sm">
              <span className="text-muted-foreground">Lost phone or left the team? Sign them out of every device.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmLogout(true)}>
                <LogOut aria-hidden="true" />
                Force logout
              </Button>
            </div>
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
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={`Sign ${member.fullName ?? member.email} out everywhere?`}
        description="Every session is revoked. Open screens stop working within 15 minutes; they sign in again with their password."
        confirmLabel="Force logout"
        tone="destructive"
        pending={forceLogout.isPending}
        error={forceLogout.error?.message}
        onConfirm={() =>
          forceLogout.mutate(
            { forceLogout: true },
            {
              onSuccess: () => {
                toast({ title: 'Signed out everywhere', description: member.email });
                setConfirmLogout(false);
              },
            },
          )
        }
      />
    </>
  );
}
