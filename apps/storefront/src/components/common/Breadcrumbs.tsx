import { cn } from '@pk/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/seo';
import { JsonLd } from './JsonLd';

/**
 * Visible breadcrumb trail + matching `BreadcrumbList` JSON-LD in one place (audit R-19), so the two
 * can never drift apart. "Home" is prepended automatically; the last item is the current page.
 * Links keep a 44px row on phones; the current page truncates instead of wrapping the trail.
 */
export function Breadcrumbs({
  items,
  className,
  tone = 'default',
}: {
  items: BreadcrumbItem[];
  className?: string;
  /** `inverse` for dark (Deep Pine `bg-secondary`) bands such as the About hero. */
  tone?: 'default' | 'inverse';
}) {
  const trail: BreadcrumbItem[] = [{ name: 'Home', href: '/' }, ...items];
  const last = trail.length - 1;
  const inverse = tone === 'inverse';
  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className={cn('text-sm', inverse ? 'text-secondary-foreground/70' : 'text-muted-foreground', className)}
        data-testid="breadcrumbs"
      >
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((item, i) =>
            i === last ? (
              <li
                key={item.href}
                aria-current="page"
                className={cn('min-w-0 truncate', inverse ? 'text-secondary-foreground' : 'text-foreground')}
              >
                {item.name}
              </li>
            ) : (
              <li key={item.href} className="flex items-center gap-1">
                <Link
                  href={item.href}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0',
                    inverse ? 'hover:text-secondary-foreground' : 'hover:text-foreground',
                  )}
                >
                  {item.name}
                </Link>
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
              </li>
            ),
          )}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(trail)} />
    </>
  );
}
