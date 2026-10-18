/** Theme: follows the system (D-14) with a manual override remembered on this device. */
export type Theme = 'light' | 'dark';

const KEY = 'pk-pay-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function resolvedTheme(): Theme {
  return storedTheme() ?? (media().matches ? 'dark' : 'light');
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — the choice just isn't remembered */
  }
  applyTheme(theme);
}

/** Apply now and keep following the system while the user hasn't chosen. */
export function initTheme(): void {
  applyTheme(resolvedTheme());
  media().addEventListener('change', () => {
    if (!storedTheme()) applyTheme(resolvedTheme());
  });
}
