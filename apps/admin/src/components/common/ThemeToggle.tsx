import { Button } from '@pk/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore, type ThemePreference } from '@/store/theme.store';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemePreference, string> = {
  system: 'Theme: follows device. Switch to light',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to follow device',
};

/** `className` lets a page restyle it for a dark photo surface (login brand band). */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useThemeStore();
  const Icon = preference === 'light' ? Sun : preference === 'dark' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={LABEL[preference]}
      onClick={() => setPreference(NEXT[preference])}
    >
      <Icon />
    </Button>
  );
}
