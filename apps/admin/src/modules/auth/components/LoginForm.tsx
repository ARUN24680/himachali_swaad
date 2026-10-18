import { StaffLoginRequestSchema } from '@pk/shared';
import { Alert, Button, Input, Label, OtpInput } from '@pk/ui';
import {
  AlertCircle,
  ArrowBigUp,
  ArrowLeft,
  Clock,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  Lock,
  PackageOpen,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { formatWait, useCountdown } from '@/hooks/useCountdown';
import { isApiError } from '@/services/api/http';
import { useStaffLogin } from '../hooks/useAuthMutations';

interface LoginFormProps {
  onSignedIn: () => void;
}

type FieldErrors = Partial<Record<'email' | 'password', string>>;

/** 840 → "14:00" — the visual lockout timer (the announced message keeps the rounded "14 minutes"). */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Visual-only ticking timer. Screen readers get the alert text instead of a per-second update. */
function LockoutTimer({ seconds }: { seconds: number }) {
  return (
    <p aria-hidden="true" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-4" />
      You can try again in <span className="font-semibold text-foreground tabular-nums">{clock(seconds)}</span>
    </p>
  );
}

/** Where each role lands after sign-in (the router decides; this just says so up front). */
function RoleHint() {
  return (
    <ul className="grid gap-3 text-sm sm:grid-cols-2" aria-label="Who signs in here">
      <li className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <LayoutDashboard aria-hidden="true" className="size-4" />
        </span>
        <span className="grid gap-0.5">
          <span className="font-semibold">Admins</span>
          <span className="text-muted-foreground">Dashboard · 2FA code after password</span>
        </span>
      </li>
      <li className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <PackageOpen aria-hidden="true" className="size-4" />
        </span>
        <span className="grid gap-0.5">
          <span className="font-semibold">Kitchen partners</span>
          <span className="text-muted-foreground">Straight to the Packing Desk</span>
        </span>
      </li>
    </ul>
  );
}

function StaffNotice() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <Lock aria-hidden="true" className="size-3.5" />
      Staff access only · activity is logged
    </p>
  );
}

/** Staff sign-in: email + password, then a 6-digit authenticator step when the API says TOTP_REQUIRED. */
export function LoginForm({ onSignedIn }: LoginFormProps) {
  const ids = {
    email: useId(),
    password: useId(),
    emailErr: useId(),
    passwordErr: useId(),
    caps: useId(),
    code: useId(),
    status: useId(),
  };
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [totp, setTotp] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  /** Set when "Use a different account" sends the user back, so focus lands back on the email field. */
  const returnedFromTotp = useRef(false);
  const login = useStaffLogin();
  const waitSec = useCountdown(blockedUntil);

  useEffect(() => {
    if (step === 'credentials' && returnedFromTotp.current) {
      returnedFromTotp.current = false;
      emailRef.current?.focus();
    }
  }, [step]);

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
          } else if (isApiError(err, 'UNAUTHENTICATED')) {
            // Wrong email/password: put the cursor back where the fix usually is
            passwordRef.current?.focus();
            passwordRef.current?.select();
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
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    if (Object.keys(errors).length === 0) send();
  };

  const submitTotp = (code: string) => {
    if (code.length === 6 && !login.isPending) send(code);
  };

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));

  const err = login.error;
  const rateLimited = isApiError(err, 'RATE_LIMITED') && waitSec > 0;
  const offline = isApiError(err, 'NETWORK_ERROR');
  let message: string | null = null;
  if (rateLimited) message = `Too many sign-in attempts. Please wait ${formatWait(waitSec)} and try again.`;
  else if (offline) message = 'Can’t reach the server. Check your connection and try again.';
  else if (isApiError(err, 'UNAUTHENTICATED'))
    message =
      step === 'totp'
        ? 'That code is incorrect. Check your authenticator app and try again.'
        : 'Invalid email or password.';
  else if (err && !isApiError(err, 'TOTP_REQUIRED') && !isApiError(err, 'RATE_LIMITED'))
    message = isApiError(err) && err.status < 500 ? err.message : 'Something went wrong on our side. Please try again.';

  const ErrorIcon = rateLimited ? Clock : offline ? WifiOff : AlertCircle;
  const errorAlert = message && (
    <Alert tone={rateLimited ? 'warning' : 'destructive'}>
      <ErrorIcon aria-hidden="true" />
      <span>{message}</span>
    </Alert>
  );

  if (step === 'totp') {
    return (
      <form
        noValidate
        aria-busy={login.isPending}
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submitTotp(totp);
        }}
      >
        <header className="grid gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-6">
            <ShieldCheck aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">Step 2 of 2</p>
          <h1 className="font-serif text-3xl font-medium">Two-factor check</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app for{' '}
            <span className="font-medium wrap-anywhere text-foreground">{email.trim()}</span>.
          </p>
        </header>
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
            invalid={Boolean(message) && !rateLimited}
            disabled={login.isPending || rateLimited}
            autoFocus
            aria-describedby={ids.status}
          />
        </div>
        <div id={ids.status} className="grid gap-2 empty:hidden">
          {errorAlert}
          {rateLimited && <LockoutTimer seconds={waitSec} />}
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
            size="lg"
            className="w-full"
            onClick={() => {
              login.reset();
              setTotp('');
              setPassword('');
              returnedFromTotp.current = true;
              setStep('credentials');
            }}
          >
            <ArrowLeft aria-hidden="true" />
            Use a different account
          </Button>
        </div>
        <StaffNotice />
      </form>
    );
  }

  const passwordDescribedBy =
    [fieldErrors.password && ids.passwordErr, capsLock && ids.caps].filter(Boolean).join(' ') || undefined;

  return (
    <form noValidate aria-busy={login.isPending} onSubmit={submitCredentials} className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">Staff sign-in</p>
        <h1 className="font-serif text-3xl font-medium md:text-4xl">Sign in</h1>
        <p className="text-sm text-muted-foreground">For Pahadi Khatki admins and kitchen partners.</p>
      </header>

      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor={ids.email}>Work email</Label>
          <Input
            ref={emailRef}
            id={ids.email}
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="you@pahadikhatki.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? ids.emailErr : undefined}
            className="h-12"
          />
          {fieldErrors.email && (
            <p id={ids.emailErr} role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={ids.password}>Password</Label>
          <div className="relative">
            <Input
              ref={passwordRef}
              id={ids.password}
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={passwordDescribedBy}
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
            <p id={ids.passwordErr} role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
              {fieldErrors.password}
            </p>
          )}
          {capsLock && (
            <p id={ids.caps} className="flex items-center gap-1.5 text-sm text-warning">
              <ArrowBigUp aria-hidden="true" className="size-4 shrink-0" />
              Caps Lock is on
            </p>
          )}
        </div>
      </div>

      {(errorAlert || rateLimited) && (
        <div className="grid gap-2">
          {errorAlert}
          {rateLimited && <LockoutTimer seconds={waitSec} />}
        </div>
      )}

      <div className="grid gap-3">
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
      </div>

      <div className="grid gap-4 border-t border-border pt-5">
        <RoleHint />
        <StaffNotice />
      </div>
    </form>
  );
}
