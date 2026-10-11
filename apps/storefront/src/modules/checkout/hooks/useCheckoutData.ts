'use client';

import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';
import { isValidPincode } from '@/lib/pincode';
import { checkoutApi } from '../api/checkoutApi';

export const checkoutKeys = {
  locality: (pincode: string) => ['shipping', 'locality', pincode] as const,
  addresses: ['me', 'addresses'] as const,
};

/** City/state for a 6-digit PIN (India Post, cached server-side). Failure is silent: fields stay manual. */
export function usePincodeLocality(pincode: string) {
  return useQuery({
    queryKey: checkoutKeys.locality(pincode),
    queryFn: ({ signal }) => checkoutApi.pincodeLocality(pincode, signal),
    enabled: isValidPincode(pincode),
    staleTime: 24 * 60 * 60_000,
    retry: false,
  });
}

/** Saved addresses for a signed-in customer. Guests never call this; a 401 just means "none". */
export function useSavedAddresses(signedIn: boolean) {
  return useQuery({
    queryKey: checkoutKeys.addresses,
    queryFn: async ({ signal }) => {
      try {
        return (await checkoutApi.savedAddresses(signal)).addresses;
      } catch (err) {
        if (isApiError(err, 'UNAUTHENTICATED') || isApiError(err, 'FORBIDDEN')) return [];
        throw err;
      }
    },
    enabled: signedIn,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
