'use client';

import { Button, buttonVariants } from '@pk/ui';
import { RefreshCcw, UserRound, WifiOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { useSession, type Session } from '../hooks/useSession';
import { openSignIn } from '../store/account-ui.store';

/**
 * Account pages need an OTP session (D-18). Guests see a sign-in prompt that opens the existing
 * sign-in sheet (mounted by AccountMenu in the header); once signed in, `children` render.
 */
export function AccountGate({
  skeleton,
  children,
}: {
  skeleton: ReactNode;
  children: (user: NonNullable<Session>['user']) => ReactNode;
}) {
  const session = useSession();
  if (session.isPending) return skeleton;
  if (session.isError) {
    return (
      <StateMessage
        tone="error"
        icon={<WifiOff />}
        title="Couldn’t check your sign-in"
        description="We couldn’t reach our server. Check your connection and try again."
        action={
          <Button variant="outline" onClick={() => void session.refetch()}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    );
  }
  if (!session.data?.user) return <SignedOutState />;
  return children(session.data.user);
}

export function SignedOutState() {
  return (
    <StateMessage
      icon={<UserRound />}
      title="Sign in to see your orders"
      description="Use the mobile number you ordered with — orders placed as a guest show up too. Just want to check one parcel? Track it with the order code instead."
      action={
        <>
          <Button onClick={openSignIn} data-testid="orders-sign-in">
            <UserRound aria-hidden="true" />
            Sign in with OTP
          </Button>
          <Link href="/track" className={buttonVariants({ variant: 'outline' })}>
            Track an order
          </Link>
        </>
      }
      className="py-16"
    />
  );
}
