import { Alert, Button, Card, CardDescription, CardHeader, CardTitle } from '@pk/ui';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { useMe } from '@/hooks/useMe';
import { REQUIRED_PARAM, REQUIRED_VALUE, ROLE_LABEL, safeNextPath, TwoFactorCard, useSignOut } from '@/modules/auth';
import { toast } from '@/store/toast.store';

/**
 * /account — who is signed in + two-factor setup. When the API refused an admin call because 2FA
 * isn't set up yet (Phase 10 §10.1), the app lands here with `?required=2fa&next=…`: a calm banner
 * explains why, and enrolling sends the admin straight back to `next` (or the dashboard).
 */
export default function AccountPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signOut = useSignOut();
  const user = me.data?.user;
  const isAdmin = user?.role === 'ADMIN';
  const required = isAdmin && params.get(REQUIRED_PARAM) === REQUIRED_VALUE;
  const next = safeNextPath(params.get('next'));

  const onEnabled = () => {
    if (!required) return;
    toast({ title: 'Two-factor is on', description: 'Thanks — you can carry on where you left off.' });
    void navigate(next, { replace: true });
  };

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={user ? ROLE_LABEL[user.role] : 'Account'}
        title="Your account"
        description="Sign-in security for your staff account."
      >
        {required &&
          (user.totpEnabled ? (
            // Enrolled elsewhere, but this session was issued before that — a fresh sign-in carries 2FA
            <Alert tone="info" data-testid="totp-required-banner">
              <ShieldCheck aria-hidden="true" />
              <div className="grid min-w-0 flex-1 gap-2">
                <p>
                  <span className="font-semibold">Two-factor is already on for your account.</span> Sign in once more so
                  this session picks it up.
                </p>
                <Button
                  variant="outline"
                  className="w-full sm:w-fit"
                  onClick={() => signOut.mutate()}
                  disabled={signOut.isPending}
                >
                  <LogIn aria-hidden="true" />
                  Sign in again
                </Button>
              </div>
            </Alert>
          ) : (
            <Alert tone="info" data-testid="totp-required-banner">
              <ShieldCheck aria-hidden="true" />
              <p className="min-w-0">
                <span className="font-semibold">
                  Two-factor authentication is required for admin accounts — set it up to continue.
                </span>{' '}
                It takes about a minute with any authenticator app.{' '}
                {next === '/'
                  ? 'You’ll go to the dashboard right after.'
                  : 'You’ll go straight back to where you were right after.'}
              </p>
            </Alert>
          ))}
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{user?.fullName ?? user?.email ?? 'Staff member'}</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
        </Card>
        {/* When 2FA is what's blocking them, the setup card comes first on phones */}
        <div className={required ? 'order-first lg:order-none' : undefined}>
          <TwoFactorCard onEnabled={onEnabled} />
        </div>
      </div>
    </div>
  );
}
