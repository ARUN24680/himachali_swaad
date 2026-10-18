import logoDark from '@pk/ui/brand/logo-horizontal-dark.png';
import logoLight from '@pk/ui/brand/logo-horizontal-light.png';
import { ShieldCheck } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function PayHeader() {
  return (
    <header className="border-b border-border bg-card/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 md:px-6">
        <span className="inline-flex items-center">
          <img src={logoLight} alt="Pahadi Khatki" width={819} height={410} className="h-11 w-auto dark:hidden" />
          <img src={logoDark} alt="Pahadi Khatki" width={819} height={410} className="hidden h-11 w-auto dark:block" />
        </span>
        <div className="flex items-center gap-1 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
            <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            Secure UPI payment
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
