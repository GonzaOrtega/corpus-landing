import type { Metadata } from 'next';
import { LegalPage, termsSections } from '@/src/components/legal-page';
import { loadServerConfig } from '@/src/config/server-env';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms for using Corpus.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const config = loadServerConfig(process.env);
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
