import Link from 'next/link';
import { PendingValue } from '@/components/common/PendingValue';
import { seller, site } from '@/config/site';
import type { LegalDoc } from '../components/LegalDocument';

const Entity = () => <PendingValue value={seller.legalName} label="Seller legal entity" />;

export const privacyPolicy: LegalDoc = {
  title: 'Privacy policy',
  description: `How ${site.name} collects, uses and protects your personal data under the Digital Personal Data Protection Act, 2023.`,
  intro: (
    <p>
      This policy explains what personal data we collect when you shop with {site.name}, why we need it, who we share it
      with and the choices you have. It is written to follow the Digital Personal Data Protection Act, 2023 (&ldquo;DPDP
      Act&rdquo;).
    </p>
  ),
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are',
      body: (
        <p>
          {site.name} is operated by <Entity />, which is the Data Fiduciary for the personal data described here. You
          can reach us using the details on our <Link href="/contact">contact page</Link> and our Grievance Officer
          through the <Link href="/grievance">grievance page</Link>.
        </p>
      ),
    },
    {
      id: 'what-we-collect',
      title: 'What we collect',
      body: (
        <ul>
          <li>
            <strong>Order details</strong> — your name, mobile number, delivery address, pincode and (optionally) email,
            the products you buy and the amount paid.
          </li>
          <li>
            <strong>Account details</strong> — if you sign in with a one-time password (OTP), your mobile number and
            saved addresses. Signing in is optional; guest checkout is always available.
          </li>
          <li>
            <strong>Payment status</strong> — our payment gateway (Razorpay) processes your UPI, card or netbanking
            details. We receive only the payment reference and status; we never see or store your card number, UPI PIN
            or banking password.
          </li>
          <li>
            <strong>Support conversations</strong> — messages you send us about an order.
          </li>
          <li>
            <strong>Device and usage data</strong> — only if you allow analytics or marketing cookies (see{' '}
            <a href="#cookies">Cookies and similar technologies</a>).
          </li>
        </ul>
      ),
    },
    {
      id: 'why',
      title: 'Why we use it',
      body: (
        <>
          <p>We use your personal data only for these purposes:</p>
          <ul>
            <li>To take payment for, pack, ship and deliver your order, and to issue a GST tax invoice.</li>
            <li>To send order and delivery updates by SMS, and by WhatsApp if you opt in at checkout.</li>
            <li>To sign you in with an OTP and show your orders and saved addresses.</li>
            <li>To answer your questions, handle refunds, damage claims and grievances.</li>
            <li>To meet legal duties — tax records, food-safety traceability (batch codes) and lawful requests.</li>
            <li>
              Only with your separate consent: to measure and improve the shop (analytics) and our advertising
              (marketing). Marketing messages are opt-in and off by default.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'consent',
      title: 'Consent and your choices',
      body: (
        <>
          <p>
            Where we rely on consent, we ask for it clearly and separately — for example the WhatsApp updates checkbox
            at checkout, marketing opt-in, and analytics/marketing cookies. Optional choices are always off until you
            turn them on.
          </p>
          <p>
            You can withdraw consent at any time — use <strong>Cookie preferences</strong> in the footer, or contact us.
            Withdrawing consent does not affect processing that already happened, and never stops you from buying as a
            guest.
          </p>
        </>
      ),
    },
    {
      id: 'sharing',
      title: 'Who we share it with',
      body: (
        <>
          <p>We share only what each partner needs to do its job, and we never sell your personal data:</p>
          <ul>
            <li>Payment gateway (Razorpay) — to process your payment and refunds.</li>
            <li>Shipping aggregator and courier partners — name, phone and delivery address to deliver your parcel.</li>
            <li>SMS and WhatsApp messaging providers — to send OTPs and order updates.</li>
            <li>Our kitchen partner in Himachal — only the details needed to pack and label your order.</li>
            <li>Google (Analytics) and Meta (Pixel and Conversions API) — only if you allow those cookies.</li>
            <li>Government authorities — when the law requires it.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'security',
      title: 'How we protect it',
      body: (
        <p>
          Data is encrypted in transit, sign-in sessions use secure http-only cookies, staff access is limited to what
          each role needs, and shipping labels and invoices are stored privately and shared only through short-lived
          links. No system is perfectly secure; if a personal data breach affects you we will inform you and the Data
          Protection Board as the DPDP Act requires.
        </p>
      ),
    },
    {
      id: 'retention',
      title: 'How long we keep it',
      body: (
        <p>
          We keep order and invoice records for as long as tax and accounting laws require, and other personal data only
          as long as it is needed for the purposes above. When it is no longer needed, we delete or anonymise it.
        </p>
      ),
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: (
        <>
          <p>Under the DPDP Act you can:</p>
          <ul>
            <li>ask for a summary of the personal data we hold about you and who we shared it with;</li>
            <li>ask us to correct, complete, update or erase your personal data;</li>
            <li>withdraw consent you gave earlier;</li>
            <li>raise a grievance with us, and then with the Data Protection Board of India if unresolved;</li>
            <li>nominate another person to exercise these rights if you are unable to.</li>
          </ul>
          <p>
            To use any of these rights, write to our Grievance Officer (see the{' '}
            <Link href="/grievance">grievance page</Link>).
          </p>
        </>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies and similar technologies',
      body: (
        <>
          <ul>
            <li>
              <strong>Strictly necessary (always on)</strong> — your cart, your cookie choice, light/dark theme and the
              last pincode you checked are stored in your browser so the shop works. Sign-in uses secure session
              cookies.
            </li>
            <li>
              <strong>Analytics (off by default)</strong> — Google Analytics 4, to understand which pages and products
              are useful. Ad personalisation signals are disabled.
            </li>
            <li>
              <strong>Marketing (off by default)</strong> — Meta Pixel and Conversions API, to measure our Instagram and
              Facebook ads (product views, add to cart, checkout starts and purchases).
            </li>
          </ul>
          <p>No analytics or marketing script loads until you allow it. Change your choice any time from the footer.</p>
        </>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          Our shop is meant for adults. We do not knowingly collect personal data from anyone under 18. If you believe a
          child has shared data with us, please contact us and we will delete it.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: (
        <p>
          We will update this page when our practices change, and tell you about significant changes before they take
          effect.
        </p>
      ),
    },
  ],
};
