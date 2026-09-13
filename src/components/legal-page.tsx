import Link from 'next/link';
import type { LegalSection } from '@/src/features/legal/content';

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
