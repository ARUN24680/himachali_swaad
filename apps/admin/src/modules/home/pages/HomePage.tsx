import { Card, CardDescription, CardHeader, CardTitle } from '@pk/ui';
import { Link } from 'react-router';
import { useMe } from '@/hooks/useMe';
import { ROLE_LABEL, TwoFactorCard } from '@/modules/auth';

/** Placeholder home until the dashboard (Phase 9) — greets the signed-in staff member. */
export default function HomePage() {
  const me = useMe();
  const user = me.data?.user;
  const firstName = user?.fullName?.split(' ')[0];

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">
          {user ? ROLE_LABEL[user.role] : 'Operations'}
        </p>
        <h1 className="font-serif text-3xl font-medium md:text-4xl">
          {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operations portal</CardTitle>
            <CardDescription>
              The catalog and inventory arrive in Phase 3, orders and packing after that.
              {import.meta.env.DEV && (
                <>
                  {' '}
                  Preview the theme on the{' '}
                  <Link to="/dev/tokens" className="font-medium text-accent-foreground underline underline-offset-4">
                    design tokens page
                  </Link>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
        <TwoFactorCard />
      </div>
    </div>
  );
}
