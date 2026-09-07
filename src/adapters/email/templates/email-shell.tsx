import { Body, Container, Head, Html, Preview, Section } from '@react-email/components';
import type { ReactNode } from 'react';

export interface EmailShellProps {
  preview: string;
  children: ReactNode;
}

export function EmailShell({ preview, children }: EmailShellProps) {
  return (
    <Html>
      <Head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            .paper { background: #171613 !important; color: #f4eee4 !important; }
            .card { background: #24211d !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="paper" style={styles.body}>
        <Container style={styles.container}>
          <Section className="card" style={styles.card}>
            {children}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f2eadf',
    color: '#211d19',
    fontFamily: 'Georgia, serif',
    margin: 0,
    padding: '32px 12px',
  },
  container: { margin: '0 auto', maxWidth: '600px' },
  card: {
    backgroundColor: '#fffaf2',
    border: '1px solid #d7c5b2',
    borderRadius: '18px',
    padding: '36px',
  },
} as const;
