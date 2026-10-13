import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, cn } from '@pk/ui';
import { AlertCircle, Check, Circle, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/password';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useChangePassword } from '../hooks/useAuthMutations';

type Field = 'currentPassword' | 'newPassword' | 'confirm';

/** "Your current password is incorrect." comes back as 401 — tell it apart from an expired session. */
const isWrongCurrent = (err: unknown) => isApiError(err, 'UNAUTHENTICATED') && /current password/i.test(err.message);

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={cn('flex items-center gap-2', ok ? 'text-success' : 'text-muted-foreground')}>
      {ok ? <Check aria-hidden="true" className="size-3.5" /> : <Circle aria-hidden="true" className="size-3.5" />}
      <span>{children}</span>
      <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
    </li>
  );
}

/**
 * Signed-in staff change their own password (POST /auth/staff/change-password). The API signs out
 * every other device and keeps this one signed in with a fresh session.
 */
export function ChangePasswordCard() {
  const change = useChangePassword();
  const [values, setValues] = useState<Record<Field, string>>({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (k: Field, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    if (change.isError) change.reset();
  };
  const { currentPassword, newPassword, confirm } = values;
  const longEnough = newPassword.length >= PASSWORD_MIN;
  const notTooLong = newPassword.length > 0 && newPassword.length <= PASSWORD_MAX;
  const differs = newPassword.length > 0 && newPassword !== currentPassword;
  const matches = newPassword.length > 0 && newPassword === confirm;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<Field, string>> = {};
    if (!currentPassword) errs.currentPassword = 'Enter your current password';
    if (!longEnough) errs.newPassword = `Use at least ${PASSWORD_MIN} characters`;
    else if (!notTooLong) errs.newPassword = `Use at most ${PASSWORD_MAX} characters`;
    else if (!differs) errs.newPassword = 'Pick a password different from your current one';
    if (!errs.newPassword && !matches) errs.confirm = 'The two new passwords don’t match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setValues({ currentPassword: '', newPassword: '', confirm: '' });
          toast({
            title: 'Password changed',
            description: 'You’re still signed in here; every other device has been signed out.',
          });
        },
        onError: (err) => {
          if (isWrongCurrent(err)) setErrors({ currentPassword: err.message });
        },
      },
    );
  };

  const formError =
    change.isError && !isWrongCurrent(change.error)
      ? isApiError(change.error, 'NETWORK_ERROR')
        ? 'Can’t reach the server. Check your connection and try again.'
        : isApiError(change.error, 'UNAUTHENTICATED')
          ? 'Your session has ended. Sign in again, then change your password.'
          : change.error.message
      : null;
  const type = show ? 'text' : 'password';

  return (
    <Card data-testid="change-password-card">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          You stay signed in on this device; every other device where you’re signed in is signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <FormField
            label="Current password"
            error={errors.currentPassword}
            aside={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-pressed={show}
                className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {show ? (
                  <EyeOff aria-hidden="true" className="size-3.5" />
                ) : (
                  <Eye aria-hidden="true" className="size-3.5" />
                )}
                {show ? 'Hide passwords' : 'Show passwords'}
              </button>
            }
          >
            <Input
              type={type}
              value={currentPassword}
              onChange={(e) => set('currentPassword', e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="New password" error={errors.newPassword}>
              <Input
                type={type}
                value={newPassword}
                onChange={(e) => set('newPassword', e.target.value)}
                autoComplete="new-password"
                maxLength={PASSWORD_MAX + 1}
              />
            </FormField>
            <FormField label="Confirm new password" error={errors.confirm}>
              <Input
                type={type}
                value={confirm}
                onChange={(e) => set('confirm', e.target.value)}
                autoComplete="new-password"
                maxLength={PASSWORD_MAX + 1}
              />
            </FormField>
          </div>
          <ul className="grid gap-1 text-xs" aria-label="Password rules">
            <Rule
              ok={longEnough && notTooLong}
            >{`${PASSWORD_MIN}–${PASSWORD_MAX} characters (a short sentence works well)`}</Rule>
            <Rule ok={differs}>Different from your current password</Rule>
            <Rule ok={matches}>Both new password fields match</Rule>
          </ul>
          {formError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{formError}</span>
            </Alert>
          )}
          <Button type="submit" className="w-full sm:w-fit" disabled={change.isPending}>
            {change.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            {change.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
