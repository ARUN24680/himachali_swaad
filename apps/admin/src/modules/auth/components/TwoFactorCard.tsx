import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, OtpInput } from '@pk/ui';
import { AlertCircle, Check, Copy, Loader2, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { useMe } from '@/hooks/useMe';
import { isApiError } from '@/services/api/http';
import { useTotpSetup, useTotpVerify } from '../hooks/useAuthMutations';
import { QrCode } from './QrCode';

function secretFrom(otpauthUrl: string): string | null {
  try {
    return new URL(otpauthUrl).searchParams.get('secret');
  } catch {
    return null;
  }
}

const describe = (err: unknown) =>
  isApiError(err, 'NETWORK_ERROR')
    ? 'Can’t reach the server. Check your connection and try again.'
    : isApiError(err) && err.status < 500
      ? err.message
      : 'Something went wrong on our side. Please try again.';

/** ADMIN-only: enrol an authenticator app (Phase 2 §2.3). Enforcement switches on in Phase 10. */
export function TwoFactorCard() {
  const me = useMe();
  const codeId = useId();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const setup = useTotpSetup();
  const verify = useTotpVerify();

  if (!me.data || me.data.user.role !== 'ADMIN') return null;
  const enabled = me.data.user.totpEnabled || verify.isSuccess;
  const otpauthUrl = setup.data?.otpauthUrl;
  const secret = otpauthUrl ? secretFrom(otpauthUrl) : null;

  const submit = (value: string) => {
    if (value.length === 6 && !verify.isPending) verify.mutate(value, { onError: () => setCode('') });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Two-factor authentication</CardTitle>
          <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? 'On' : 'Off'}</Badge>
        </div>
        <CardDescription>
          {enabled
            ? 'Your account asks for a code from your authenticator app at every sign-in.'
            : 'Protect your admin account with a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…).'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        {enabled ? (
          <Alert tone="success">
            <ShieldCheck aria-hidden="true" />
            <span>Two-factor authentication is on.</span>
          </Alert>
        ) : !otpauthUrl ? (
          <div className="grid gap-3">
            {setup.isError && (
              <Alert tone="destructive">
                <AlertCircle aria-hidden="true" />
                <span>{describe(setup.error)}</span>
              </Alert>
            )}
            <Button className="w-full sm:w-fit" onClick={() => setup.mutate()} disabled={setup.isPending}>
              {setup.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {setup.isPending ? 'Preparing…' : 'Set up two-factor'}
            </Button>
          </div>
        ) : (
          <form
            noValidate
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit(code);
            }}
          >
            <div className="grid content-start justify-items-start gap-3">
              <p className="text-sm font-medium">1. Scan with your authenticator app</p>
              <QrCode value={otpauthUrl} label="QR code to add Pahadi Khatki to your authenticator app" />
              {secret && (
                <div className="grid w-full gap-1.5">
                  <p className="text-xs text-muted-foreground">Can&rsquo;t scan? Enter this key instead:</p>
                  <div className="flex items-center gap-1">
                    <code className="min-w-0 flex-1 rounded-sm bg-muted px-2 py-1.5 font-mono text-sm break-all tabular-nums">
                      {secret.match(/.{1,4}/g)?.join(' ')}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={copied ? 'Setup key copied' : 'Copy setup key'}
                      onClick={() => {
                        void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
                      }}
                    >
                      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid max-w-sm content-start gap-3">
              <label htmlFor={codeId} className="text-sm font-medium">
                2. Enter the 6-digit code it shows
              </label>
              <OtpInput
                id={codeId}
                label="6-digit code from your authenticator app"
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (verify.isError) verify.reset();
                }}
                onComplete={submit}
                invalid={verify.isError}
                disabled={verify.isPending}
                className="max-w-sm"
              />
              <div aria-live="polite" className="empty:hidden">
                {verify.isError && (
                  <Alert tone="destructive">
                    <AlertCircle aria-hidden="true" />
                    <span>{describe(verify.error)}</span>
                  </Alert>
                )}
              </div>
              <Button type="submit" className="w-full sm:w-fit" disabled={code.length !== 6 || verify.isPending}>
                {verify.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {verify.isPending ? 'Checking…' : 'Turn on two-factor'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
