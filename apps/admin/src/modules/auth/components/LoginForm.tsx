import { StaffLoginRequestSchema } from '@pk/shared';
import { Alert, Button, Input, Label, OtpInput } from '@pk/ui';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { formatWait, useCountdown } from '@/hooks/useCountdown';
import { isApiError } from '@/services/api/http';
import { useStaffLogin } from '../hooks/useAuthMutations';

interface LoginFormProps {
  onSignedIn: () => void;
}

type FieldErrors = Partial<Record<'email' | 'password', string>>;

/** Staff sign-in: email + password, then a 6-digit authenticator step when the API says TOTP_REQUIRED. */
export function LoginForm({ onSignedIn }: LoginFormProps) {
  const ids = {
    email: useId(),
    password: useId(),
    emailErr: useId(),
    passwordErr: useId(),
    code: useId(),
    status: useId(),
  };
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const login = useStaffLogin();
  const waitSec = useCountdown(blockedUntil);

  const send = (code?: string) => {
    login.mutate(
      { email: email.trim(), password, ...(code ? { totp: code } : {}) },
      {
        onSuccess: onSignedIn,
        onError: (err) => {
          if (isApiError(err, 'TOTP_REQUIRED')) {
            setStep('totp');
            setTotp('');
          } else if (isApiError(err, 'RATE_LIMITED')) {
            setBlockedUntil(Date.now() + (err.retryAfterSeconds ?? 60) * 1000);
          } else if (code) {
            setTotp(''); // wrong authenticator code — clear the boxes for another go
          }
        },
      },
    );
  };

  const submitCredentials = (e: FormEvent) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!StaffLoginRequestSchema.shape.email.safeParse(email.trim()).success)
      errors.email = 'Enter your work email address';
    if (!password) errors.password = 'Enter your password';
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) send();
  };

  const submitTotp = (code: string) => {
    if (code.length === 6 && !login.isPending) send(code);
  };

  const err = login.error;
  const rateLimited = isApiError(err, 'RATE_LIMITED') && waitSec > 0;
  let message: string | null = null;
  if (rateLimited) message = `Too many sign-in attempts. Please wait ${formatWait(waitSec)} and try again.`;
  else if (isApiError(err, 'NETWORK_ERROR')) message = 'Can’t reach the server. Check your connection and try again.';
  else if (isApiError(err, 'UNAUTHENTICATED'))
    message =
      step === 'totp'
        ? 'That code is incorrect. Check your authenticator app and try again.'
        : 'Invalid email or password.';
  else if (err && !isApiError(err, 'TOTP_REQUIRED') && !isApiError(err, 'RATE_LIMITED'))
    message = isApiError(err) && err.status < 500 ? err.message : 'Something went wrong on our side. Please try again.';

  const errorAlert = message && (
    <Alert tone="destructive">
      <AlertCircle aria-hidden="true" />
      <span>{message}</span>
    </Alert>
  );

  if (step === 'totp') {
    return (
      <form
        noValidate
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submitTotp(totp);
        }}
      >
        <div className="grid gap-2">
          <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5">
            <ShieldCheck aria-hidden="true" />
          </span>
          <h2 className="font-serif text-2xl font-medium">Two-factor check</h2>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app for{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>.
          </p>
        </div>
        <div className="grid gap-2">
          <label htmlFor={ids.code} className="text-sm leading-none font-medium">
            Authentication code
          </label>
          <OtpInput
            id={ids.code}
            label="6-digit authentication code"
            value={totp}
            onChange={(v) => {
              setTotp(v);
              if (login.isError) login.reset();
            }}
            onComplete={submitTotp}
            invalid={Boolean(message)}
            disabled={login.isPending || rateLimited}
            autoFocus
            aria-describedby={ids.status}
          />
        </div>
        <div id={ids.status} aria-live="polite" className="empty:hidden">
          {errorAlert}
        </div>
        <div className="grid gap-2">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={totp.length !== 6 || login.isPending || rateLimited}
          >
            {login.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Verifying…
              </>
            ) : (
              'Verify and sign in'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              login.reset();
              setTotp('');
              setPassword('');
              setStep('credentials');
            }}
          >
            <ArrowLeft aria-hidden="true" />
            Use a different account
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={submitCredentials} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor={ids.email}>Work email</Label>
        <Input
          id={ids.email}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@pahadikhatki.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? ids.emailErr : undefined}
          className="h-12"
        />
        {fieldErrors.email && (
          <p id={ids.emailErr} role="alert" className="text-sm text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.password}>Password</Label>
        <div className="relative">
          <Input
            id={ids.password}
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? ids.passwordErr : undefined}
            className="h-12 pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            aria-controls={ids.password}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {fieldErrors.password && (
          <p id={ids.passwordErr} role="alert" className="text-sm text-destructive">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {errorAlert}

      <Button type="submit" size="lg" className="w-full" disabled={login.isPending || rateLimited}>
        {login.isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">Forgot your password? Ask an admin to reset it.</p>
    </form>
  );
}
