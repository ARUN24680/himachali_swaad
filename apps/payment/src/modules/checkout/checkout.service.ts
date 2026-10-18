import QRCode from 'qrcode';
import { paiseToRupees } from '../../lib/money';
import type { GatewayService } from '../gateway/gateway.service';

/** What the pay page shows. No PII: the order is identified by its unguessable id only. */
export interface PayView {
  orderId: string;
  orderCode: string;
  /** The exact amount to pay (order total − 0..99 paise). */
  payablePaise: number;
  /** The order total the store charged; payablePaise ≤ this. */
  amountPaise: number;
  status: 'created' | 'paid' | 'expired';
  /** Store's jar reservation end — the QR stops being offered after this. */
  expiresAt: string;
  payeeName: string;
  payeeVpa: string;
  /** upi://pay intent (mobile "Open UPI app") — same content as the QR. */
  upiUri: string;
  /** data:image/svg+xml;base64,… — rendered as an <img>, never as inline markup. */
  qrDataUrl: string;
  /** Storefront order page, built from config + order code (never from the request: no open redirect). */
  returnUrl: string;
}

export function createCheckoutService(deps: {
  gateway: GatewayService;
  vpa: string;
  payeeName: string;
  storefrontUrl: string;
}) {
  const qrCache = new Map<string, string>();

  function upiUri(payablePaise: number, orderCode: string): string {
    const params = new URLSearchParams({
      pa: deps.vpa,
      pn: deps.payeeName,
      am: paiseToRupees(payablePaise),
      cu: 'INR',
      tn: `Order ${orderCode}`,
    });
    // URLSearchParams encodes spaces as '+', which some UPI apps show literally
    return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
  }

  async function qr(uri: string): Promise<string> {
    const hit = qrCache.get(uri);
    if (hit) return hit;
    const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    if (qrCache.size > 500) qrCache.clear();
    qrCache.set(uri, url);
    return url;
  }

  return {
    async view(orderId: string): Promise<PayView> {
      const o = await deps.gateway.getOrder(orderId);
      const uri = upiUri(o.payable_paise, o.receipt);
      return {
        orderId: o.id,
        orderCode: o.receipt,
        payablePaise: o.payable_paise,
        amountPaise: o.amount_paise,
        status: o.status,
        expiresAt: o.expires_at.toISOString(),
        payeeName: deps.payeeName,
        payeeVpa: deps.vpa,
        upiUri: uri,
        qrDataUrl: await qr(uri),
        returnUrl: new URL(`/order/${encodeURIComponent(o.receipt)}`, deps.storefrontUrl).toString(),
      };
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
