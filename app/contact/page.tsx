import type { Metadata } from 'next';
import { LegalPage } from '@/src/components/legal-page';
import { loadSiteConfig } from '@/src/config/server-env';
import { contactSections } from '@/src/features/agent-readiness/content';

export const metadata: Metadata = {
  title: 'Contact Corpus',
  description: 'How to contact Corpus and what the public support channel is for.',
  alternates: {
    canonical: '/contact',
    types: { 'text/markdown': '/contact.md' },
  },
};

export default function ContactPage() {
  const config = loadSiteConfig(process.env);
  return (
    <LegalPage
      contactEmail={config.replyTo}
      description="How to contact Corpus and what the public support channel is for."
      postalAddress={config.emailPostalAddress}
      sections={contactSections}
      title="Contact Corpus"
    />
  );
}
