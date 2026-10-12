/**
 * Mandatory ADMIN 2FA (D-19, Phase 10 §10.1): where the admin goes when the API answers
 * 403 TOTP_ENROLLMENT_REQUIRED, and where they return to after enrolling. Pure functions, no router.
 */
export const ACCOUNT_PATH = '/account';
/** `/account?required=2fa&next=/orders` — the banner shows only while this flag is in the URL. */
export const REQUIRED_PARAM = 'required';
export const REQUIRED_VALUE = '2fa';

/**
 * Only same-app paths: must start with a single "/", never "//" or "/\" (protocol-relative →
 * off-site), never back to /account (that would be a loop). Anything else → the dashboard.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  const pathname = raw.split(/[?#]/, 1)[0]!;
  if (pathname === ACCOUNT_PATH || pathname === '/login') return '/';
  return raw;
}

/**
 * The 2FA setup URL for an admin currently at `pathname + search`, or null when they are already
 * on it (no redirect → no loop). From a plain /account visit we add the flag but keep next = "/".
 */
export function totpSetupUrl(pathname: string, search: string): string | null {
  const here = new URLSearchParams(search);
  if (pathname === ACCOUNT_PATH && here.get(REQUIRED_PARAM) === REQUIRED_VALUE) return null;
  if (pathname === '/login') return null;
  const params = new URLSearchParams({ [REQUIRED_PARAM]: REQUIRED_VALUE });
  const next = pathname === ACCOUNT_PATH ? here.get('next') : pathname + search;
  const safe = safeNextPath(next);
  if (safe !== '/') params.set('next', safe);
  return `${ACCOUNT_PATH}?${params.toString()}`;
}
