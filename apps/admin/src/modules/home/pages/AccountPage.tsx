import { Card, CardDescription, CardHeader, CardTitle } from '@pk/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { useMe } from '@/hooks/useMe';
import { ROLE_LABEL, TwoFactorCard } from '@/modules/auth';

/** /account — who is signed in + two-factor setup (moved here from the Phase 2 placeholder home). */
export default function AccountPage() {
  const me = useMe();
  const user = me.data?.user;
  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={user ? ROLE_LABEL[user.role] : 'Account'}
        title="Your account"
        description="Sign-in security for your staff account."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{user?.fullName ?? user?.email ?? 'Staff member'}</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
        </Card>
        <TwoFactorCard />
      </div>
    </div>
  );
}
