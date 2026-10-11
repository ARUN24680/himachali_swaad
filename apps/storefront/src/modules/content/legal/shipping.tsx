import Link from 'next/link';
import { PendingValue } from '@/components/common/PendingValue';
import { policy, site } from '@/config/site';
import type { LegalDoc } from '../components/LegalDocument';

export const shippingPolicy: LegalDoc = {
  title: 'Shipping policy',
  description: `Where and how ${site.name} ships, delivery timelines and charges.`,
  intro: (
    <p>
      Every order is packed by hand in our Himachal kitchen and shipped prepaid with a tracked courier. Here is what to
      expect between checkout and your doorstep.
    </p>
  ),
  sections: [
    {
      id: 'areas',
      title: 'Where we deliver',
      body: (
        <p>
          We ship to serviceable pincodes across India. Enter your pincode on any product page to check delivery before
          you order — we&rsquo;ll also confirm it at checkout.
        </p>
      ),
    },
    {
      id: 'dispatch',
      title: 'Packing and dispatch',
      body: (
        <ul>
          <li>Orders are packed in our kitchen after payment is confirmed.</li>
          <li>
            The courier collects parcels once a day. Orders confirmed before the daily pickup cut-off usually leave the
            same working day; later orders leave the next working day.
          </li>
          <li>Jars are sealed and cushioned so they survive mountain roads and city sorting centres.</li>
        </ul>
      ),
    },
    {
      id: 'timelines',
      title: 'Delivery timelines',
      body: (
        <p>
          Most orders arrive within a few working days of dispatch. The estimate for your pincode is shown by the
          pincode checker on the product page. Remote areas, weather in the hills and festive peaks can add a day or two
          — we&rsquo;ll keep you posted.
        </p>
      ),
    },
    {
      id: 'charges',
      title: 'Shipping charges',
      body: (
        <>
          <p>Any shipping charge is shown in your cart and at checkout before you pay.</p>
          <p>
            Free delivery: <PendingValue value={policy.freeShippingRule} label="Free-shipping rule" />. When it applies,
            your cart shows how close you are.
          </p>
        </>
      ),
    },
    {
      id: 'tracking',
      title: 'Tracking your order',
      body: (
        <p>
          When your parcel is handed to the courier we send the tracking number by SMS (and WhatsApp, if you opted in at
          checkout). You&rsquo;ll get updates as it moves until delivery.
        </p>
      ),
    },
    {
      id: 'freshness',
      title: 'Freshness on arrival',
      body: (
        <p>
          We only ship jars that still have a healthy shelf life left. The batch code, manufacture date and best-before
          date are printed on every jar and shown on the product page for the batch currently shipping.
        </p>
      ),
    },
    {
      id: 'failed',
      title: 'Failed deliveries',
      body: (
        <p>
          The courier will try to reach you on the phone number you gave. If delivery fails repeatedly, the parcel is
          returned to us — see the <Link href="/refund-cancellation">refund &amp; cancellation policy</Link> for what
          happens next. Please double-check your address and pincode at checkout.
        </p>
      ),
    },
  ],
};
