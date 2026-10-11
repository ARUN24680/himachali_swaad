'use client';

import { Button } from '@pk/ui';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/** D-14 manual override on top of the system preference. Icons swap via the `.dark` class → no hydration flash. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="dark:hidden" />
    </Button>
  );
}
