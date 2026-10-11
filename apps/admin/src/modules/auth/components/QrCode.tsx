import { create } from 'qrcode';
import { useMemo } from 'react';

/**
 * QR rendered locally as SVG from the module matrix — the secret never leaves the browser
 * (no external QR service). Always drawn dark-on-light (`.light` scope) so phone cameras read it in dark mode too.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: 'M' });
    const quiet = 4;
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.data[row * modules.size + col]) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    return { path: d, size: modules.size + quiet * 2 };
  }, [value]);

  return (
    <div className="light w-fit rounded-lg border border-border bg-card p-2">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${size} ${size}`}
        className="size-44 text-foreground sm:size-48"
        shapeRendering="crispEdges"
      >
        <path d={path} className="fill-current" />
      </svg>
    </div>
  );
}
