import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useMe } from '@/hooks/useMe';
import { LoginBrandHeader, LoginBrandPanel } from '../components/LoginBrandPanel';
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
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-3 lg:p-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
      {/* Desktop: framed photo panel. Phones/tablets: a compact photo band instead. */}
      <LoginBrandPanel className="hidden lg:flex" />

      <div className="relative isolate flex min-h-dvh min-w-0 flex-col lg:min-h-0">
        {/* Light theme, desktop: a warm sandstone panel with a gold glow so the form column answers the
            photo panel instead of sitting on flat ivory. Dark theme keeps its single-tone canvas. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden rounded-2xl bg-linear-to-br from-accent via-muted/70 to-muted lg:block dark:lg:hidden"
        >
          <div className="absolute -top-24 -right-24 size-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-secondary/10 blur-3xl" />
        </div>

        <LoginBrandHeader className="lg:hidden" />

        <div className="hidden justify-end lg:flex">
          <ThemeToggle />
        </div>

        {/* Mobile: a sheet rising over the band. md: a card floating over the photo. lg: centred in its column. */}
        <main className="relative -mt-6 flex flex-1 flex-col md:mt-0 md:items-center md:justify-center md:px-8 md:pt-56 md:pb-16 lg:pt-0 lg:pb-14">
          <section className="relative w-full flex-1 rounded-t-3xl border-t border-border bg-card px-5 pt-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-card-foreground shadow-float md:max-w-md md:flex-none md:rounded-2xl md:border md:p-8 lg:max-w-[28rem] lg:overflow-hidden lg:border-transparent lg:shadow-2xl lg:ring-1 lg:shadow-secondary/15 lg:ring-secondary/10 xl:p-10 dark:lg:border-border dark:lg:shadow-float dark:lg:ring-0">
            {/* Light theme, desktop: gold rule across the top of the card */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 hidden h-1 bg-primary lg:block dark:lg:hidden"
            />
            <LoginForm onSignedIn={() => void navigate(next, { replace: true })} />
          </section>
        </main>
      </div>
    </div>
  );
}
