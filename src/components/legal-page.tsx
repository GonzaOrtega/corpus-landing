import Link from 'next/link';

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
}

export const privacySections: readonly LegalSection[] = [
  {
    heading: 'What we collect',
    paragraphs: [
      'When you join early access, we collect your email address, consent record, and early-access lifecycle and delivery status. We use this information only to operate the early-access list, confirm your address, send release information, and let you manage your subscription.',
    ],
  },
  {
    heading: 'Service providers',
    paragraphs: [
      'We use Neon to store the early-access record, Resend to deliver transactional email, Google reCAPTCHA to help protect the signup form, and Vercel to host Corpus, including Vercel Web Analytics and Speed Insights.',
      'We do not sell your information or use it for unrelated marketing. We do not use email open or click tracking.',
    ],
  },
  {
    heading: 'Retention and control',
    paragraphs: [
      'You can unsubscribe using the management link in our email and later resubscribe with the same address. We remove identifying information 30 days after an unsubscribe that is not reversed, or 30 days after a successful launch email.',
      'After anonymization, we may retain non-identifying delivery and lifecycle counters to operate the service safely.',
    ],
  },
];

export const termsSections: readonly LegalSection[] = [
  {
    heading: 'Early access',
    paragraphs: [
      'Corpus is a pre-release product. We do not guarantee a release date, and features and availability may change before or after release.',
      'Early builds may contain defects and may be subject to platform and distribution requirements.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'You must not abuse Corpus, interfere with its operation, or attempt to access it outside the distribution methods we make available.',
    ],
  },
];

interface LegalPageProps {
  title: string;
  description: string;
  sections: readonly LegalSection[];
  contactEmail?: string | null;
  postalAddress?: string | null;
}

export function LegalPage({
  title,
  description,
  sections,
  contactEmail,
  postalAddress,
}: LegalPageProps) {
  return (
    <main className="legal-page wrap">
      <Link className="legal-back" href="/">
        ← Corpus
      </Link>
      <p className="eyebrow">Corpus</p>
      <h1>{title}</h1>
      <p className="legal-description">{description}</p>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      {(contactEmail || postalAddress) && (
        <section>
          <h2>Contact</h2>
          {contactEmail && <p>{contactEmail}</p>}
          {postalAddress && <p>{postalAddress}</p>}
        </section>
      )}
    </main>
  );
}
