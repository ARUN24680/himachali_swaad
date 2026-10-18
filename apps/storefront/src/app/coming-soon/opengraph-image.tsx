import { ImageResponse } from 'next/og';
import { OG_RIDGE, OG_SIZE, ogPalette as c } from '@/lib/og-palette';

/** Share card for the teaser: no brand, no product — overrides the store's root OG image. */
export const alt = 'Something is coming from the mountains — Himachal Pradesh';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function TeaserOpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 120,
        background: c.pine,
        color: c.ivory,
        position: 'relative',
      }}
    >
      <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx="600" cy="430" r="80" fill={c.gold} />
        <path d={OG_RIDGE} fill={c.mist} />
      </svg>
      <div style={{ fontSize: 26, letterSpacing: 8, color: c.gold, textTransform: 'uppercase' }}>Coming soon</div>
      <div style={{ fontSize: 76, fontWeight: 700, marginTop: 20, textAlign: 'center', maxWidth: 1000 }}>
        Something is coming from the mountains
      </div>
      <div style={{ fontSize: 30, marginTop: 16, color: c.mistStrong }}>Himachal Pradesh</div>
    </div>,
    size,
  );
}
