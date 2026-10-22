/**
 * Local-storage product images (STORAGE_DRIVER=local) come back from the API as absolute URLs built
 * from the backend's API_PUBLIC_URL, e.g. `http://192.168.88.14:4000/dev-assets/products/…`. That host
 * is whatever LAN address the backend was configured with, and the Next image optimiser fetches it
 * server-side: when the address goes stale (laptop on another network, DHCP change) every image the
 * optimiser has not cached yet fails with a 504 — new variants show a broken photo while older ones
 * still render from the optimiser cache.
 *
 * The storefront already proxies `/dev-assets/*` to INTERNAL_API_URL (next.config rewrites), so a
 * dev asset is turned into that same-origin path. It then works from localhost, a LAN IP or Docker
 * alike, and needs no private-IP allowance in the optimiser. CDN URLs (R2/S3) are returned untouched.
 */
const DEV_ASSET_PREFIX = '/dev-assets/';

export function resolveAssetUrl(src: string): string {
  if (src.startsWith('/')) return src;
  try {
    const url = new URL(src);
    return url.pathname.startsWith(DEV_ASSET_PREFIX) ? `${url.pathname}${url.search}` : src;
  } catch {
    return src;
  }
}
