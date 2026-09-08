import type { Metadata } from 'next';
import { LegalPage, termsSections } from '@/src/components/legal-page';
import { loadSiteConfig } from '@/src/config/server-env';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms for using Corpus.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const config = loadSiteConfig(process.env);
  return (
    <LegalPage
      contactEmail={config.replyTo}
      description="Terms for using Corpus."
      postalAddress={config.emailPostalAddress}
      sections={termsSections}
      title="Terms"
    />
  );
}
