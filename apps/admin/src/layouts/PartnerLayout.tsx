import { cn } from '@pk/ui';
import { Boxes, ClipboardList, Mountain, Settings, Wallet } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { I18nProvider } from '@/app/providers/I18nProvider';
import { Toaster } from '@/components/feedback/Toaster';
import { BottomNav, type BottomNavItem } from '@/components/navigation/BottomNav';
import { useT } from '@/i18n';
import {
  InstallBanner,
  LanguageToggle,
  OfflineBanner,
  SyncBadge,
  UpdatePrompt,
  useOutboxSync,
  usePartnerOrders,
} from '@/modules/packing-desk';

/**
 * Kitchen Partner Packing Desk shell (/desk/*, Phase 7, D-16): Deep Pine app bar (continues into
 * the phone status bar via theme-color), bottom tab bar on phones, top tabs on tablet/desktop.
 * Only packing, batches, hisaab and settings — never revenue, customers or admin settings (D-40).
 */
export function PartnerLayout() {
  return (
    <I18nProvider>
      <PartnerShell />
    </I18nProvider>
  );
}

function PartnerShell() {
  const t = useT();
  useOutboxSync();
  const queue = usePartnerOrders('AWAITING_PACKING');
  const items: BottomNavItem[] = [
    { to: '/desk', label: t('nav.orders'), icon: ClipboardList, end: true, badge: queue.data?.toPack },
    { to: '/desk/batches', label: t('nav.batches'), icon: Boxes },
    { to: '/desk/hisaab', label: t('nav.hisaab'), icon: Wallet },
    { to: '/desk/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-base text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        {t('common.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 bg-secondary pt-[env(safe-area-inset-top)] text-secondary-foreground">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link
            to="/desk"
            aria-label={`${t('common.appName')} · ${t('common.brand')}`}
            className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5"
            >
              <Mountain />
            </span>
            {/* Tablet: the top tabs need the room — logo mark only */}
            <span className="grid min-w-0 leading-tight md:hidden lg:grid">
              <span className="truncate font-serif text-lg font-semibold">{t('common.appName')}</span>
              <span className="truncate text-xs tracking-[0.12em] text-secondary-foreground/75 uppercase">
                {t('common.brand')}
              </span>
            </span>
          </Link>
          <nav aria-label={t('nav.label')} className="hidden items-center gap-1 md:flex lg:ml-4">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-2 rounded-md px-3 text-base font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-5',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-secondary-foreground/85 hover:bg-secondary-foreground/10 hover:text-secondary-foreground',
                  )
                }
              >
                <Icon aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SyncBadge />
            <LanguageToggle />
          </div>
        </div>
      </header>
      <UpdatePrompt />
      <OfflineBanner />
      <InstallBanner />
      <main id="main" className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-8 md:pb-10">
        <Suspense
          fallback={
            <div
              role="status"
              aria-label={t('queue.loading')}
              className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
            />
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <BottomNav items={items} label={t('nav.label')} size="lg" />
      <Toaster />
    </div>
  );
}
