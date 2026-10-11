import { PendingValue } from '@/components/common/PendingValue';
import { seller, site } from '@/config/site';
import type { LegalDoc } from '../components/LegalDocument';
import { SellerCard } from '../components/SellerCard';

const g = seller.grievanceOfficer;

export const grievancePolicy: LegalDoc = {
  title: 'Grievance redressal',
  description: `Grievance Officer and complaint process for ${site.name} under the Consumer Protection (E-Commerce) Rules, 2020.`,
  intro: (
    <p>
      If you are unhappy with an order or with how we handled your personal data, our Grievance Officer will look into
      it. This page follows the Consumer Protection (E-Commerce) Rules, 2020 and the DPDP Act, 2023.
    </p>
  ),
  sections: [
    {
      id: 'officer',
      title: 'Grievance Officer',
      body: (
        <dl
          className="divide-y divide-border rounded-lg border border-border bg-card text-sm"
          data-testid="grievance-officer"
        >
          {(
            [
              ['Name', g.name],
              ['Designation', g.designation],
              ['Email', g.email],
              ['Phone', g.phone],
              ['Address', seller.address],
            ] as const
          ).map(([term, value]) => (
            <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="min-w-0 break-words text-foreground">
                <PendingValue value={value} label={`Grievance officer ${term.toLowerCase()}`}>
                  {(v) =>
                    term === 'Email' ? (
                      <a href={`mailto:${v}`}>{v}</a>
                    ) : term === 'Phone' ? (
                      <a href={`tel:${v.replace(/\s/g, '')}`}>{v}</a>
                    ) : (
                      v
                    )
                  }
                </PendingValue>
              </dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: 'how',
      title: 'How to raise a grievance',
      body: (
        <>
          <p>Email or write to the Grievance Officer with:</p>
          <ul>
            <li>your order code (for example PK-7KQ2M9) and the mobile number used for the order;</li>
            <li>what went wrong, and what outcome you are looking for;</li>
            <li>photos, if the complaint is about a damaged or incorrect product.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'timelines',
      title: 'What happens next',
      body: (
        <ul>
          <li>
            We <strong>acknowledge your complaint within 48 hours</strong> of receiving it.
          </li>
          <li>
            We <strong>resolve it within one month</strong> of receiving it, and tell you the outcome and the reasons.
          </li>
        </ul>
      ),
    },
    {
      id: 'escalate',
      title: 'If you are not satisfied',
      body: (
        <ul>
          <li>
            National Consumer Helpline: call <a href="tel:1915">1915</a> or visit{' '}
            <a href="https://consumerhelpline.gov.in" rel="noopener noreferrer" target="_blank">
              consumerhelpline.gov.in
            </a>
            .
          </li>
          <li>
            File a consumer complaint online through{' '}
            <a href="https://edaakhil.nic.in" rel="noopener noreferrer" target="_blank">
              e-Daakhil
            </a>
            .
          </li>
          <li>For personal-data complaints, you may approach the Data Protection Board of India.</li>
        </ul>
      ),
    },
    {
      id: 'seller',
      title: 'Seller details',
      body: <SellerCard />,
    },
  ],
};
