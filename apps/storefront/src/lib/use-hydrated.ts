import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** false during SSR and the hydration render, true afterwards — for reading browser-only storage safely. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
