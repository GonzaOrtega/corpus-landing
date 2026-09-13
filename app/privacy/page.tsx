import type { Metadata } from 'next';
import { LegalPage } from '@/src/components/legal-page';
import { loadSiteConfig } from '@/src/config/server-env';
import { privacySections } from '@/src/features/legal/content';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Corpus handles early-access information.',
  alternates: {
    canonical: '/privacy',
    types: { 'text/markdown': '/privacy.md' },
  },
};

export default function PrivacyPage() {
  const config = loadSiteConfig(process.env);
  return (
    <LegalPage
      contactEmail={config.replyTo}
      description="How Corpus handles early-access information."
      postalAddress={config.emailPostalAddress}
      sections={privacySections}
      title="Privacy"
    />
  );
}
