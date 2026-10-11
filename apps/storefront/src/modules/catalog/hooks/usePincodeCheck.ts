'use client';

import { PincodeSchema } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { writeLastPincode } from '@/lib/last-pincode';
import { shippingApi } from '../api/shippingApi';

/**
 * Debounced serviceability check (Phase 4 §4.6): fires 400 ms after the 6th valid digit, caches per
 * pincode for the session, and remembers the last successfully checked pincode for checkout prefill.
 */
export function usePincodeCheck(input: string) {
  const [debounced, setDebounced] = useState(input);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 400);
    return () => clearTimeout(t);
  }, [input]);

  const valid = PincodeSchema.safeParse(debounced).success;
  const query = useQuery({
    queryKey: ['shipping', 'pincode', debounced],
    queryFn: ({ signal }) => shippingApi.checkPincode(debounced, signal),
    enabled: valid,
    staleTime: 30 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (query.data) writeLastPincode(query.data.pincode);
  }, [query.data]);

  const complete = input.length === 6;
  const inputValid = PincodeSchema.safeParse(input).success;
  return {
    ...query,
    /** 6 digits typed but not a real PIN format (e.g. starts with 0). */
    invalid: complete && !inputValid,
    /** Waiting for debounce or network. */
    checking: inputValid && (debounced !== input || query.isFetching),
    settled: inputValid && debounced === input && !query.isFetching,
  };
}
