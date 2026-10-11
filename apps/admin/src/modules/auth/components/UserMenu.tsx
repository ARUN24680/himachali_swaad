import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pk/ui';
import { ChevronDown, Loader2, LogOut, MonitorSmartphone } from 'lucide-react';
import { useMe } from '@/hooks/useMe';
import { useSignOut } from '../hooks/useAuthMutations';
import { initials, ROLE_LABEL } from './roleLabel';

/** Header user menu: who's signed in, sign out here, sign out everywhere. */
export function UserMenu() {
  const me = useMe();
  const signOut = useSignOut();
  const signOutAll = useSignOut({ everywhere: true });

  if (!me.data) {
    return <div role="status" aria-label="Loading account" className="size-11 animate-pulse rounded-full bg-muted" />;
  }

  const { user } = me.data;
  const name = user.fullName ?? user.email ?? 'Staff member';
  const busy = signOut.isPending || signOutAll.isPending;
  const failed = signOut.isError || signOutAll.isError;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-1.5 sm:pr-3" aria-label={`Account menu for ${name}`}>
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          >
            {initials(user.fullName, user.email)}
          </span>
          <span className="hidden max-w-40 truncate text-left sm:block">{name}</span>
          <ChevronDown aria-hidden="true" className="hidden text-muted-foreground sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel className="grid gap-1">
          <span className="truncate font-medium text-foreground">{name}</span>
          {user.email && user.email !== name && (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          )}
          <Badge tone="neutral" className="mt-1 w-fit">
            {ROLE_LABEL[user.role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={(e) => {
            e.preventDefault(); // stay open to show progress / errors
            signOut.mutate();
          }}
        >
          {signOut.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
        <DropdownMenuItem
          tone="destructive"
          disabled={busy}
          onSelect={(e) => {
            e.preventDefault();
            signOutAll.mutate();
          }}
        >
          {signOutAll.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <MonitorSmartphone aria-hidden="true" />
          )}
          {signOutAll.isPending ? 'Signing out everywhere…' : 'Sign out of all devices'}
        </DropdownMenuItem>
        {failed && (
          <p role="alert" className="px-3 pt-1 pb-2 text-sm text-destructive">
            Couldn&rsquo;t sign out. Check your connection and try again.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
