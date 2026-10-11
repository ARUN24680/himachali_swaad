import Link from 'next/link';
import { PendingValue } from '@/components/common/PendingValue';
import { seller, site } from '@/config/site';
import type { LegalDoc } from '../components/LegalDocument';

export const termsOfService: LegalDoc = {
  title: 'Terms of service',
  description: `The terms that apply when you browse and buy from ${site.name}.`,
  intro: (
    <p>
      These terms apply when you use this website and buy from {site.name}. By placing an order you agree to them,
      together with our <Link href="/privacy-policy">privacy policy</Link>,{' '}
      <Link href="/shipping-policy">shipping policy</Link> and{' '}
      <Link href="/refund-cancellation">refund &amp; cancellation policy</Link>.
    </p>
  ),
  sections: [
    {
      id: 'seller',
      title: 'Who you are buying from',
      body: (
        <p>
          The seller of every product on this website is{' '}
          <PendingValue value={seller.legalName} label="Seller legal entity" />, registered at{' '}
          <PendingValue value={seller.address} label="Registered address" /> (GSTIN{' '}
          <PendingValue value={seller.gstin} label="GSTIN" />, FSSAI Lic. No.{' '}
          <PendingValue value={seller.fssaiLicenseNo} label="FSSAI licence number" />
          ).
        </p>
      ),
    },
    {
      id: 'eligibility',
      title: 'Using the shop',
      body: (
        <ul>
          <li>You must be 18 or older to place an order.</li>
          <li>
            You can buy as a guest; signing in with an OTP is optional and only needed to see your order history and
            saved addresses.
          </li>
          <li>Please give accurate contact and delivery details — we use them to deliver your order.</li>
        </ul>
      ),
    },
    {
      id: 'products',
      title: 'Our products',
      body: (
        <ul>
          <li>
            All our products are <strong>non-vegetarian</strong> pickles and carry the non-veg mark. Please read the
            ingredients and allergen information on each product page before you buy.
          </li>
          <li>
            Photos are representative; as a handmade product, colour and piece size vary a little between batches. Net
            weight is as stated on the label.
          </li>
          <li>
            Every jar carries its batch number, manufacture date and best-before date. We ship only jars with a healthy
            remaining shelf life.
          </li>
        </ul>
      ),
    },
    {
      id: 'prices',
      title: 'Prices and payment',
      body: (
        <ul>
          <li>
            Prices are in Indian Rupees and are MRP inclusive of all taxes. Shipping charges, if any, are shown before
            you pay.
          </li>
          <li>
            We accept <strong>prepaid orders only</strong> — UPI, cards and netbanking through our payment gateway. Cash
            on delivery is not available at this time.
          </li>
          <li>
            Prices and stock are re-checked when you open your cart and at checkout. The price shown when you pay is the
            price you are charged.
          </li>
        </ul>
      ),
    },
    {
      id: 'orders',
      title: 'Orders and stock',
      body: (
        <>
          <p>
            Your order is confirmed only after your payment succeeds. When you start payment we hold your jars for a
            short time; if payment isn&rsquo;t completed in that window, the hold is released.
          </p>
          <p>
            Our pickles are made in small batches. If a payment arrives after the hold expired and the stock has run
            out, we refund the full amount automatically to your original payment method.
          </p>
        </>
      ),
    },
    {
      id: 'delivery-returns',
      title: 'Delivery, cancellation and refunds',
      body: (
        <p>
          Delivery timelines and areas are explained in our <Link href="/shipping-policy">shipping policy</Link>.
          Because our products are food, they cannot be returned once delivered — see the{' '}
          <Link href="/refund-cancellation">refund &amp; cancellation policy</Link> for cancellations and damaged or
          incorrect items.
        </p>
      ),
    },
    {
      id: 'use',
      title: 'Acceptable use',
      body: (
        <p>
          Don&rsquo;t misuse the website — for example by attempting to access other people&rsquo;s orders, overloading
          our systems, or placing orders you don&rsquo;t intend to pay for. We may refuse or cancel orders that look
          fraudulent and will refund any amount paid.
        </p>
      ),
    },
    {
      id: 'ip',
      title: 'Content and trademarks',
      body: (
        <p>
          The {site.name} name, logo, photos and text on this website belong to us. Please don&rsquo;t reuse them
          without our written permission.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Our responsibility',
      body: (
        <p>
          We are responsible for supplying products that match their description and are safe to eat before their
          best-before date when stored as instructed. Nothing in these terms limits your rights under the Consumer
          Protection Act, 2019. Beyond that, our total liability for any order is limited to the amount you paid for it.
        </p>
      ),
    },
    {
      id: 'law',
      title: 'Governing law and complaints',
      body: (
        <p>
          These terms are governed by the laws of India. Please raise any complaint first with our{' '}
          <Link href="/grievance">Grievance Officer</Link>; you also keep every right to approach the consumer
          commissions.
        </p>
      ),
    },
  ],
};
