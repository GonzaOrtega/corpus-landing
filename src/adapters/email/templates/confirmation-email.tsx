import { Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailShell } from './email-shell';

export interface ConfirmationEmailProps {
  managementUrl: string;
  postalAddress: string;
}

export function ConfirmationEmail({ managementUrl, postalAddress }: ConfirmationEmailProps) {
  return (
    <EmailShell preview="You're confirmed. We'll write once more when Corpus is ready to try.">
      <Text style={styles.eyebrow}>CORPUS · EARLY ACCESS</Text>
      <Heading style={styles.heading}>You're on the list.</Heading>
      <Text style={styles.body}>
        Corpus is still in private development. You're confirmed for early access. We'll write again
        when there's a build worth trying. Early access begins on Android.
      </Text>
      <Section style={styles.specimen}>
        <Text style={styles.word}>lucent</Text>
        <Text style={styles.definition}>clear enough for light to pass through</Text>
      </Section>
      <Text style={styles.steps}>Capture · Enrich · Practice</Text>
      <Text style={styles.body}>That's the whole commitment. No newsletter, no drip sequence.</Text>
      <Hr style={styles.rule} />
      <Text style={styles.footer}>
        You're receiving this because you asked for early access to Corpus. We'll send one more
        email when there's a build worth trying.
      </Text>
      <Text style={styles.footer}>
        <Link href={managementUrl} style={styles.link}>
          Manage early access
        </Link>
      </Text>
      <Text style={styles.address}>{postalAddress}</Text>
    </EmailShell>
  );
}

const styles = {
  eyebrow: {
    color: '#9a5e44',
    fontFamily: 'Arial, sans-serif',
    fontSize: '12px',
    letterSpacing: '2px',
  },
  heading: { color: '#211d19', fontSize: '38px', fontWeight: 'normal', lineHeight: '1.15' },
  body: { fontSize: '17px', lineHeight: '1.65' },
  specimen: { backgroundColor: '#ead8c7', borderRadius: '12px', padding: '18px 22px' },
  word: { fontSize: '28px', fontStyle: 'italic', margin: '0 0 6px' },
  definition: { fontFamily: 'Arial, sans-serif', fontSize: '14px', margin: 0 },
  steps: {
    color: '#9a5e44',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  rule: { borderColor: '#d7c5b2', margin: '28px 0' },
  footer: { fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: '1.5' },
  link: { color: '#8a4935', textDecoration: 'underline' },
  address: { color: '#766b61', fontFamily: 'Arial, sans-serif', fontSize: '11px' },
} as const;
