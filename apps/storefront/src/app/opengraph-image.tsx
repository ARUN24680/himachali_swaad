import { ImageResponse } from 'next/og';
import { site } from '@/config/site';
import { OG_RIDGE, OG_SIZE, ogPalette as c } from '@/lib/og-palette';

export const alt = `${site.name} — ${site.tagline}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: c.pine,
        color: c.ivory,
        position: 'relative',
      }}
    >
      <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx="960" cy="200" r="70" fill={c.gold} />
        <path d={OG_RIDGE} fill={c.mist} />
      </svg>
      <div style={{ fontSize: 28, letterSpacing: 6, color: c.gold, textTransform: 'uppercase' }}>
        From a Himachal kitchen
      </div>
      <div style={{ fontSize: 92, fontWeight: 700, marginTop: 16 }}>{site.name}</div>
      <div style={{ fontSize: 38, marginTop: 12, color: c.mistStrong, maxWidth: 820 }}>{site.tagline}</div>
    </div>,
    size,
  );
}
