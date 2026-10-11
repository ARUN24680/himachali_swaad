import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (epoch ms), ticking every second. 0 when passed or null. */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** 42 → "42 seconds", 272 → "5 minutes" (rounded up — never promise less than the real wait) */
export function formatWait(sec: number): string {
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const min = Math.ceil(sec / 60);
  return `${min} minute${min === 1 ? '' : 's'}`;
}
