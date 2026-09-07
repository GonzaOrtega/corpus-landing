import type { Metadata } from 'next';
import { LegalPage, privacySections } from '@/src/components/legal-page';
import { loadServerConfig } from '@/src/config/server-env';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Corpus handles early-access information.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const config = loadServerConfig(process.env);
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
