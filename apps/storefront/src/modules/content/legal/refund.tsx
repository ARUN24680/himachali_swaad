import Link from 'next/link';
import { PendingValue } from '@/components/common/PendingValue';
import { policy, site } from '@/config/site';
import type { LegalDoc } from '../components/LegalDocument';

export const refundPolicy: LegalDoc = {
  title: 'Refund & cancellation policy',
  description: `Cancellations, damaged jars and refunds at ${site.name}.`,
  intro: (
    <p>
      Pickles are food, so we can&rsquo;t take them back once delivered. But if something goes wrong — a jar breaks in
      transit, you receive the wrong item, or we can&rsquo;t fulfil your order — we will make it right.
    </p>
  ),
  sections: [
    {
      id: 'no-returns',
      title: 'Food is non-returnable',
      body: (
        <p>
          For hygiene and food-safety reasons, opened or unopened jars cannot be returned or exchanged for change of
          mind, taste preference or an order placed by mistake once they have been delivered.
        </p>
      ),
    },
    {
      id: 'cancel',
      title: 'Cancelling an order',
      body: (
        <ul>
          <li>
            You can cancel a confirmed order <strong>until it is handed over to the courier</strong>. Contact customer
            care with your order code; we refund the full amount, including shipping.
          </li>
          <li>Once the parcel has left our kitchen, the order can no longer be cancelled.</li>
          <li>
            We may cancel an order if a product becomes unavailable or a payment looks fraudulent. You get a full refund
            automatically.
          </li>
        </ul>
      ),
    },
    {
      id: 'damage',
      title: 'Damaged, leaking or wrong items',
      body: (
        <>
          <p>
            If a jar arrives broken or leaking, or you receive the wrong product, tell us within{' '}
            <PendingValue value={policy.damageClaimWindow} label="Damage claim window" /> of delivery with your order
            code and clear photos of the parcel, jar and label. Evidence required:{' '}
            <PendingValue value={policy.damageEvidence} label="Damage claim evidence rule" />.
          </p>
          <p>
            Once we verify the claim we will send a replacement (subject to stock) or refund the affected items — your
            choice.
          </p>
        </>
      ),
    },
    {
      id: 'undelivered',
      title: 'Undelivered or returned parcels',
      body: (
        <p>
          If a parcel comes back to us undelivered (for example the address could not be found or the delivery was
          refused), the returned jars cannot be resold for food-safety reasons. Refund rule for such orders:{' '}
          <PendingValue value={policy.rtoRefundRule} label="Undelivered order refund rule" />.
        </p>
      ),
    },
    {
      id: 'payment-issues',
      title: 'Payment issues',
      body: (
        <ul>
          <li>
            If money was debited but your order was not confirmed, the amount is refunded automatically — you
            don&rsquo;t need to contact us.
          </li>
          <li>If you were charged twice for the same order, the duplicate payment is refunded in full.</li>
        </ul>
      ),
    },
    {
      id: 'timeline',
      title: 'How refunds are paid',
      body: (
        <p>
          Refunds go back to the original payment method (UPI, card or bank account). Once approved, refunds reach you
          in <PendingValue value={policy.refundTimeline} label="Refund timeline" />; the exact time depends on your
          bank. For help with a refund, see our <Link href="/contact">contact page</Link>.
        </p>
      ),
    },
  ],
};
