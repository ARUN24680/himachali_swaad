import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useMe } from '@/hooks/useMe';
import { LoginForm } from '../components/LoginForm';

/** Only same-app paths are allowed as a post-login target (no open redirects). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/login'))
    return '/';
  return raw;
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const me = useMe();

  // Already signed in (e.g. opened /login in a second tab) → straight through
  if (me.data && me.data.user.role !== 'CUSTOMER') return <Navigate to={next} replace />;

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel — desktop only; phones get straight to the form */}
      <aside className="relative hidden overflow-hidden bg-secondary p-12 text-secondary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 font-serif text-2xl font-semibold">Pahadi Khatki</div>
        <div className="grid max-w-md gap-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">Operations portal</p>
          <p className="font-serif text-4xl leading-tight font-medium text-balance">
            Every jar, from the kitchen in Kullu to the customer&rsquo;s door.
          </p>
          <p className="text-secondary-foreground/75">Orders, packing, stock and settlements — in one place.</p>
        </div>
        <p className="text-sm text-secondary-foreground/60">Staff access only · activity is logged</p>
      </aside>

      <main className="flex min-w-0 flex-col">
        <div className="flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold lg:invisible">Pahadi Khatki</div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0 md:px-8">
          <div className="grid w-full max-w-sm gap-8 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-8 lg:border-0 lg:bg-transparent lg:p-0">
            <header className="grid gap-2">
              <p className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase lg:hidden">
                Operations portal
              </p>
              <h1 className="font-serif text-3xl font-medium">Sign in</h1>
              <p className="text-sm text-muted-foreground">For Pahadi Khatki admins and kitchen partners.</p>
            </header>
            <LoginForm onSignedIn={() => void navigate(next, { replace: true })} />
          </div>
        </div>
      </main>
    </div>
  );
}
