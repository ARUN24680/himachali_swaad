import { env } from '@/lib/env';
import { ApiRequestError, http } from './http';

/** `attachment; filename="orders-2026-10.csv"` (or RFC 5987 filename*=UTF-8''…) → the name. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

async function rawGet(path: string) {
  try {
    return await fetch(`${env.VITE_API_URL}/api/v1${path}`, {
      credentials: 'include',
      headers: { accept: 'text/csv, */*' },
    });
  } catch {
    throw new ApiRequestError({ code: 'NETWORK_ERROR', message: 'You seem to be offline.', status: 0 });
  }
}

/**
 * Streamed CSV exports (Phase 9 §9.10): fetch → blob → save with the server's file name. On an
 * expired session we let the JSON client refresh it once (GET /auth/me) and try again.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  let res = await rawGet(path);
  if (res.status === 401) {
    await http('/auth/me'); // refreshes the session (or redirects to sign-in)
    res = await rawGet(path);
  }
  if (!res.ok) {
    let message = 'The export failed. Please try again.';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* not JSON */
    }
    throw new ApiRequestError({ code: 'BAD_RESPONSE', message, status: res.status });
  }
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
  saveBlob(await res.blob(), name);
  return name;
}

/**
 * Open a short-lived signed URL (label, invoice, statement PDF) in a new tab. The tab is opened
 * inside the click (popup blockers) and pointed at the URL once the API answers.
 * Returns the URL when the browser blocked the tab, so the caller can show a manual link.
 */
export async function openSignedUrl(fetchUrl: () => Promise<{ url: string }>): Promise<string | null> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { url } = await fetchUrl();
    if (tab && !tab.closed) {
      tab.location.href = url;
      return null;
    }
    return url;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
