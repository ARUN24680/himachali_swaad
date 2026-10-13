import type { StaffRow } from '@pk/shared';
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
} from '@pk/ui';
import { AlertCircle, Check, Copy, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { PASSWORD_MAX, PASSWORD_MIN, tempPassword } from '@/lib/password';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useResetStaffPassword } from '../hooks/useStaff';

const errorText = (err: unknown) =>
  isApiError(err, 'NETWORK_ERROR')
    ? 'Can’t reach the server. Check your connection and try again.'
    : err instanceof Error
      ? err.message
      : 'Something went wrong. Please try again.';

/**
 * Admin sets a temporary password for another staff member (POST /admin/staff/:id/reset-password).
 * The API signs them out everywhere and lifts a login lockout. After success the dialog stays open
 * on a "done" step so the admin can still copy the password before closing.
 */
export function ResetPasswordDialog({
  member,
  onOpenChange,
}: {
  member: StaffRow;
  onOpenChange: (o: boolean) => void;
}) {
  const reset = useResetStaffPassword(member.id);
  const [password, setPassword] = useState(() => tempPassword());
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = member.fullName ?? member.email;
  const tooShort = password.length < PASSWORD_MIN;
  const tooLong = password.length > PASSWORD_MAX;
  const fieldError =
    touched && tooShort
      ? `Use at least ${PASSWORD_MIN} characters`
      : tooLong
        ? `Use at most ${PASSWORD_MAX} characters`
        : undefined;
  const done = reset.isSuccess;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Couldn’t copy', description: 'Select the password and copy it by hand.', tone: 'destructive' });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || tooLong) return;
    reset.mutate(password, {
      onSuccess: () => toast({ title: `Password reset for ${name}`, description: 'They’re signed out everywhere.' }),
    });
  };

  const copyButton = (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !reset.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet" className="sm:max-w-lg" data-testid="reset-password-dialog">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{done ? 'Temporary password set' : `Reset ${name}’s password?`}</DialogTitle>
            <DialogDescription>
              They are signed out everywhere and any login lockout is lifted. Share the password privately; they should
              change it from Account.
            </DialogDescription>
          </DialogHeader>

          {done ? (
            <Alert tone="success" data-testid="reset-password-done">
              <ShieldCheck aria-hidden="true" />
              <span>
                {reset.data.revokedSessions === 0
                  ? `${name} had no open sessions.`
                  : `${name} was signed out of ${reset.data.revokedSessions} session${reset.data.revokedSessions === 1 ? '' : 's'}.`}{' '}
                Their old password no longer works.
              </span>
            </Alert>
          ) : null}

          <FormField
            label="Temporary password"
            hint={done ? 'Copy it now — it isn’t shown again.' : `At least ${PASSWORD_MIN} characters`}
            error={fieldError}
            aside={
              <span className="flex items-center gap-3">
                {!done && (
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(tempPassword());
                      setCopied(false);
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                    Generate
                  </button>
                )}
                {copyButton}
              </span>
            }
          >
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={done}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              maxLength={PASSWORD_MAX + 1}
            />
          </FormField>

          {reset.isError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{errorText(reset.error)}</span>
            </Alert>
          )}
          <DialogFooter>
            {done ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={reset.isPending}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={reset.isPending}>
                  {reset.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound aria-hidden="true" />
                  )}
                  Reset password
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
