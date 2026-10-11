import { Button } from '@pk/ui';
import { LogOut } from 'lucide-react';
import { FullPageError } from '@/components/common/FullPageStatus';
import { useSignOut } from '../hooks/useAuthMutations';

/** RoleGuard fallback: signed in, but not as staff (e.g. a customer session on the shared cookie domain). */
export function NotStaffNotice() {
  const signOut = useSignOut();
  return (
    <FullPageError
      title="This portal is for staff"
      message="You're signed in with an account that can't use the operations portal. Sign out and sign in with your staff email."
      actions={
        <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          <LogOut aria-hidden="true" />
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </Button>
      }
    />
  );
}
