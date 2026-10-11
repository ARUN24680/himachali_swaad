import { withTimeout } from '../../utils/with-timeout';

/**
 * PIN → district/state for checkout auto-fill (Phase 5 §5.4) via the public India Post directory
 * (api.postalpincode.in). Best effort: any failure returns nulls and the customer types it in.
 */
export interface PincodeDirectory {
  lookup(pincode: string): Promise<{ city: string | null; state: string | null }>;
}

interface PostOffice {
  District?: string;
  State?: string;
}

export function createIndiaPostDirectory(
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): PincodeDirectory {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async lookup(pincode) {
      try {
        const res = await withTimeout(
          doFetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`),
          opts.timeoutMs ?? 4000,
          'india post pincode lookup',
        );
        if (!res.ok) return { city: null, state: null };
        const body = (await res.json()) as { Status?: string; PostOffice?: PostOffice[] | null }[];
        const office = body[0]?.Status === 'Success' ? body[0].PostOffice?.[0] : undefined;
        return { city: office?.District?.trim() || null, state: office?.State?.trim() || null };
      } catch {
        return { city: null, state: null };
      }
    },
  };
}

/** Tests / CI: no network. */
export const createStaticDirectory = (
  table: Record<string, { city: string; state: string }> = {},
): PincodeDirectory => ({
  lookup: async (pincode) => table[pincode] ?? { city: null, state: null },
});
