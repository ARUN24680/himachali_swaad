'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pk/ui';
import { ChevronDown, Loader2, LogOut, Package, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useSignOut } from '../hooks/useAuthMutations';
import { useSession } from '../hooks/useSession';
import { openSignIn } from '../store/account-ui.store';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAccountUiStore } from '../store/account-ui.store';

/**
 * The OTP sheet (forms, OTP input, phone validation) is fetched only when someone taps "Sign in",
 * keeping it out of every page's first-load JS (Phase 4 Lighthouse budget).
 */
const SignInDialog = dynamic(() => import('./SignInDialog').then((m) => m.SignInDialog), { ssr: false });

/** Header account control: "Sign in" for guests, masked phone + "Sign out" when signed in. */
export function AccountMenu() {
  const session = useSession();
  const signOut = useSignOut();
  const signInOpen = useAccountUiStore((s) => s.signInOpen);
  // Mount the lazy dialog on first open and keep it mounted (so its close animation still plays)
  const [dialogMounted, setDialogMounted] = useState(false);
  if (signInOpen && !dialogMounted) setDialogMounted(true);

  let control;
  if (session.isPending) {
    control = (
      <div
        role="status"
        aria-label="Loading your account"
        className="h-11 w-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none sm:w-28"
      />
    );
  } else if (session.data?.user) {
    const phone = session.data.user.phoneMasked?.replace(/^\+91/, '+91 ') ?? 'Your account';
    control = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-3" aria-label={`Account menu, signed in as ${phone}`}>
            <span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-4">
              <UserRound aria-hidden="true" />
            </span>
            <span className="hidden tabular-nums sm:inline">{phone}</span>
            <ChevronDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block text-xs text-muted-foreground">Signed in as</span>
            <span className="block font-medium text-foreground tabular-nums">{phone}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account/orders">
              <Package aria-hidden="true" />
              My orders
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={signOut.isPending}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open to show progress / errors
              signOut.mutate();
            }}
          >
            {signOut.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
          {signOut.isError && (
            <p role="alert" className="px-3 pt-1 pb-2 text-sm text-destructive">
              Couldn&rsquo;t sign out. Check your connection and try again.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else {
    // Signed out — or /me failed (offline): guests can still sign in or browse
    control = (
      <Button variant="outline" onClick={openSignIn} className="w-11 px-0 sm:w-auto sm:px-5">
        <UserRound aria-hidden="true" />
        {/* Icon-only on phones to fit the header; the accessible name stays "Sign in" */}
        <span className="sr-only sm:not-sr-only">Sign in</span>
      </Button>
    );
  }

  return (
    <>
      {control}
      {dialogMounted && <SignInDialog />}
    </>
  );
}
