import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import type { LaunchEmailContent } from '../../../core/ports/email-sender.port';
import { EmailShell } from './email-shell';

export interface LaunchEmailProps extends LaunchEmailContent {
  managementUrl: string;
  postalAddress: string;
}

export function LaunchEmail(props: LaunchEmailProps) {
  return (
    <EmailShell preview="Early access is open on Android. Here's what's in the first build — and what isn't.">
      <Text style={styles.eyebrow}>EARLY ACCESS · ANDROID · {props.releaseVersion}</Text>
      <Heading style={styles.heading}>It's ready to try.</Heading>
      <Text style={styles.body}>
        You asked to hear when there was a build worth trying. This is it. {props.releaseSummary}
      </Text>
      <Button href={props.downloadUrl.toString()} style={styles.button}>
        Get Corpus
      </Button>
      <Section style={styles.panel}>
        <Heading as="h2" style={styles.sectionHeading}>
          In the first build
        </Heading>
        {props.includedFeatures.map((feature) => (
          <Text key={feature} style={styles.item}>
            ◆ {feature}
          </Text>
        ))}
      </Section>
      <Section style={styles.section}>
        <Heading as="h2" style={styles.sectionHeading}>
          What isn't there yet
        </Heading>
        {props.knownLimitations.map((limitation) => (
          <Text key={limitation} style={styles.item}>
            {limitation}
          </Text>
        ))}
        <Text style={styles.body}>
          Telling us what breaks is the most useful thing you can do right now. Replying to this
          email reaches a person.
        </Text>
      </Section>
      <Text style={styles.closing}>Structure creates freedom.</Text>
      <Hr style={styles.rule} />
      <Text style={styles.footer}>
        You're receiving this because you asked for early access to Corpus. This is the email we
        promised.
      </Text>
      <Text style={styles.footer}>
        <a href={props.managementUrl} style={styles.link}>
          Manage early access
        </a>{' '}
        · Corpus · {props.postalAddress}
      </Text>
    </EmailShell>
  );
}

const styles = {
  eyebrow: { color: '#8a867d', fontFamily: 'Arial, sans-serif', fontSize: '12px' },
  heading: { color: '#211d19', fontSize: '42px', fontWeight: 'normal', lineHeight: '1.05' },
  body: { fontFamily: 'Arial, sans-serif', fontSize: '16px', lineHeight: '1.6' },
  button: { backgroundColor: '#b0503a', color: '#fbfaf6', padding: '14px 28px' },
  panel: { backgroundColor: '#fbfaf6', marginTop: '32px', padding: '24px' },
  section: { marginTop: '28px' },
  sectionHeading: { fontSize: '16px', fontWeight: 'normal', textTransform: 'uppercase' },
  item: { fontFamily: 'Arial, sans-serif', fontSize: '15px', lineHeight: '1.6' },
  closing: { fontSize: '24px', fontStyle: 'italic', marginTop: '32px' },
  rule: { borderColor: '#d7c5b2', margin: '28px 0' },
  footer: { color: '#766b61', fontFamily: 'Arial, sans-serif', fontSize: '13px' },
  link: { color: '#766b61', textDecoration: 'underline' },
} as const;
