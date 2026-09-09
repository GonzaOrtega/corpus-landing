import type { Metadata } from 'next';
import { LegalPage } from '@/src/components/legal-page';
import { developerSections } from '@/src/features/agent-readiness/content';

export const metadata: Metadata = {
  title: 'Corpus Developer Resources',
  description: 'Current Corpus integration status and machine-readable developer resources.',
  alternates: { canonical: '/developers' },
};

export default function DevelopersPage() {
  return (
    <LegalPage
      description="Current Corpus integration status and machine-readable developer resources."
      sections={developerSections}
      title="Corpus Developer Resources"
    />
  );
}
