import { StaffCreateRequestSchema, type KitchenRow, type StaffCreateRequest, type StaffRow } from '@pk/shared';
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
import { Link } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { tempPassword } from '@/lib/password';
import { localPhone, normalisePhone } from '@/lib/phone';
import { toast } from '@/store/toast.store';
import { useCreateStaff, useUpdateStaff } from '../hooks/useStaff';
import { ResetPasswordDialog } from './ResetPasswordDialog';

/** What the kitchen checkboxes need — the ADMIN kitchens list (GET /admin/kitchens). */
export type KitchenOption = Pick<KitchenRow, 'id' | 'code' | 'name' | 'city' | 'isActive'>;

function KitchenPicker({
  kitchens,
  value,
  onChange,
  error,
}: {
  kitchens: KitchenOption[] | undefined;
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
        <p className="text-sm text-muted-foreground">
          No kitchens set up yet —{' '}
          <Link to="/kitchens" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
            add one on the Kitchens page
          </Link>
          .
        </p>
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
  kitchens: KitchenOption[] | undefined;
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
          description: 'Share the temporary password privately — they can change it from Account after signing in.',
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
  kitchens: KitchenOption[] | undefined;
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
  const [resetting, setResetting] = useState(false);

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
              {isSelf ? (
                <span className="text-muted-foreground">
                  This is you — change your own password from the{' '}
                  <Link to="/account" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
                    Account page
                  </Link>
                  .
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    Forgot their password or locked out? Set a temporary one.
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setResetting(true)}>
                    <KeyRound aria-hidden="true" />
                    Reset password
                  </Button>
                </>
              )}
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
      {resetting && !isSelf && <ResetPasswordDialog member={member} onOpenChange={setResetting} />}
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
