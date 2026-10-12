import { describe, expect, it } from 'vitest';
import { quietHoursRelease, renderTemplate, TEMPLATES, TEMPLATE_NAMES } from '../src/notifications';

const ist = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, d, h, m) - 5.5 * 3600_000);

describe('template registry (Phase 8 §8.5)', () => {
  it('every template has en + hi text using exactly its declared variables', () => {
    for (const name of TEMPLATE_NAMES) {
      const spec = TEMPLATES[name];
      for (const lang of ['en', 'hi'] as const) {
        const used = [...spec.text[lang].matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
        expect([...new Set(used)], `${name}/${lang}`).toEqual([...spec.variables].sort());
      }
    }
  });
  it('critical = confirmed / OFD / failed attempt / cancelled / refund; quiet hours for digest + settlement', () => {
    expect(TEMPLATE_NAMES.filter((n) => TEMPLATES[n].critical).sort()).toEqual(
      ['delivery_attempt_failed', 'order_cancelled', 'order_confirmed', 'out_for_delivery', 'refund_processed'].sort(),
    );
    expect(TEMPLATE_NAMES.filter((n) => TEMPLATES[n].quietHours).sort()).toEqual([
      'packing_digest',
      'settlement_ready',
    ]);
  });
  it('renders variables, leaves unknown placeholders visible', () => {
    expect(renderTemplate('delivered_storage_tip', 'hi', { order_code: 'PK-7KQ2M9' })).toBe(
      'Order PK-7KQ2M9 deliver ho gaya! Thandi jagah rakhein, hamesha sookha chammach use karein 🏔️',
    );
    expect(renderTemplate('out_for_delivery', 'en', { order_code: 'PK-7KQ2M9' })).toContain('{{track_url}}');
  });
});

describe('quietHoursRelease (21:00–08:00 IST)', () => {
  it('daytime → null; 22:00 → next day 08:00; 03:00 → same day 08:00; boundaries', () => {
    expect(quietHoursRelease(ist(12, 8))).toBeNull();
    expect(quietHoursRelease(ist(12, 20, 59))).toBeNull();
    expect(quietHoursRelease(ist(12, 21))?.toISOString()).toBe(ist(13, 8).toISOString());
    expect(quietHoursRelease(ist(12, 22, 30))?.toISOString()).toBe(ist(13, 8).toISOString());
    expect(quietHoursRelease(ist(13, 3))?.toISOString()).toBe(ist(13, 8).toISOString());
    expect(quietHoursRelease(ist(13, 7, 59))?.toISOString()).toBe(ist(13, 8).toISOString());
  });
});
