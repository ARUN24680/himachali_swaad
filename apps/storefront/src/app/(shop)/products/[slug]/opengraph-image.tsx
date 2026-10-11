import { formatINR } from '@pk/shared';
import { ImageResponse } from 'next/og';
import { site } from '@/config/site';
import { OG_RIDGE, OG_SIZE, ogPalette as c } from '@/lib/og-palette';
import { catalogApi, formatWeight } from '@/modules/catalog';

export const alt = `${site.name} pickle`;
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Dynamic OG card per product: photo, name, weight, MRP — shared on Instagram/WhatsApp. */
export default async function ProductOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await catalogApi.detail(slug).catch(() => null);
  const image = product?.images[0];
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: c.pine,
        color: c.ivory,
        position: 'relative',
      }}
    >
      <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={OG_RIDGE} fill={c.mist} />
      </svg>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 0 0 80px',
          width: 680,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 26,
            letterSpacing: 4,
            color: c.gold,
            textTransform: 'uppercase',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              border: `3px solid ${c.nonveg}`,
              background: c.ivory,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: 999, background: c.nonveg }} />
          </div>
          {site.name}
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 20, lineHeight: 1.05 }}>
          {product?.title ?? 'Himachali pickle'}
        </div>
        {product && (
          <div style={{ display: 'flex', gap: 24, marginTop: 28, fontSize: 36, alignItems: 'center' }}>
            <div
              style={{ background: c.gold, color: c.charcoal, padding: '8px 22px', borderRadius: 12, fontWeight: 700 }}
            >
              {formatINR(product.pricePaise, { trimZeroPaise: true })}
            </div>
            <div style={{ color: c.mistStrong }}>{formatWeight(product.netWeightG)} jar · MRP incl. taxes</div>
          </div>
        )}
      </div>
      {image && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 520 }}>
          <img
            src={image}
            width={420}
            height={420}
            style={{ borderRadius: 210, border: `6px solid ${c.gold}`, objectFit: 'cover' }}
            alt=""
          />
        </div>
      )}
    </div>,
    size,
  );
}
