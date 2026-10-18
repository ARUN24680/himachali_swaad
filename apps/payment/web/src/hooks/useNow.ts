import { useEffect, useState } from 'react';

/** Current time (corrected by the server clock skew), ticking every second while `active`. */
export function useNow(skewMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now + skewMs;
}
