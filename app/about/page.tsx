import type { Metadata } from 'next';
import { LegalPage } from '@/src/components/legal-page';
import { aboutSections } from '@/src/features/agent-readiness/content';

export const metadata: Metadata = {
  title: 'About Corpus',
  description: 'What Corpus is, why it exists, and its current product stage.',
  alternates: {
    canonical: '/about',
    types: { 'text/markdown': '/about.md' },
  },
};

export default function AboutPage() {
  return (
    <LegalPage
      description="What Corpus is, why it exists, and its current product stage."
      sections={aboutSections}
      title="About Corpus"
    />
  );
}
