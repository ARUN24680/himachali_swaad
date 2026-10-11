'use client';

import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from '@pk/ui';
import { ChevronRight, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { legalNav, mainNav } from '@/config/navigation';

/** Phone/tablet menu: bottom sheet (thumb reach) with main links, help links and the theme toggle. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu aria-hidden="true" className="size-5!" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel="Close menu">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <nav aria-label="Mobile">
            <ul className="grid">
              {mainNav.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === l.href ? 'page' : undefined}
                    className={cn(
                      'flex min-h-12 items-center justify-between rounded-md px-2 font-serif text-xl outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                      pathname === l.href ? 'text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    {l.label}
                    <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 mb-1 px-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Policies
            </p>
            <ul className="grid">
              {legalNav.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-border px-3 py-1">
            <span className="text-sm text-foreground">Appearance</span>
            <ThemeToggle />
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
