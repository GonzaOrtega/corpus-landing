import { Button } from '@react-email/components';
import type { LaunchEmailContent } from '../../../core/ports/email-sender.port';
import {
  EmailDiamond,
  EmailFooter,
  EmailPanel,
  EmailRow,
  EmailShell,
  EmailSpine,
  emailStyles,
} from './email-shell';

export interface LaunchEmailProps extends LaunchEmailContent {
  managementUrl: string;
  postalAddress: string;
}

export function LaunchEmail(props: LaunchEmailProps) {
  return (
    <EmailShell preview="Early access is open on Android. Here's what's in the first build — and what isn't.">
      <EmailRow>
        <EmailSpine>
          <p
            className="muted sans"
            style={{ ...emailStyles.muted, margin: '0 0 14px', fontSize: '13px' }}
          >
            Early access · Android · {props.releaseVersion}
          </p>
          <h1
            className="h1 launch-h1 ink"
            style={{
              ...emailStyles.heading,
              margin: '0 0 22px',
              fontSize: '44px',
              lineHeight: '1',
            }}
          >
            It's ready to try.
          </h1>
          <p className="ink sans" style={emailStyles.body}>
            You asked to hear when there was a build worth trying. This is it.{' '}
            {props.releaseSummary}
          </p>
          <p
            className="muted sans"
            style={{ ...emailStyles.muted, margin: '0 0 30px', fontSize: '15px' }}
          >
            It's a first build, and it behaves like one. What that means is below — both halves of
            it.
          </p>
          <table role="presentation" cellPadding="0" cellSpacing="0" border={0} className="btn">
            <tbody>
              <tr>
                <td style={{ backgroundColor: '#B0503A' }}>
                  <Button
                    className="sans"
                    href={props.downloadUrl.toString()}
                    style={{
                      backgroundColor: '#B0503A',
                      padding: '15px 30px',
                      fontFamily: emailStyles.sans,
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#FBFAF6',
                      textDecoration: 'none',
                    }}
                  >
                    Get Corpus
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </EmailSpine>
      </EmailRow>
      <EmailRow padding="40px 40px 0">
        <EmailPanel>
          <h2 className="muted sans" style={emailStyles.label}>
            In the first build
          </h2>
          {props.includedFeatures.map((feature, index) => (
            <p
              key={feature}
              className="ink sans"
              style={{
                ...emailStyles.item,
                margin: index === props.includedFeatures.length - 1 ? 0 : '0 0 14px',
              }}
            >
              <EmailDiamond />
              {'  '}
              {feature}
            </p>
          ))}
        </EmailPanel>
      </EmailRow>
      <EmailRow padding="32px 40px 0">
        <EmailSpine>
          <h2 className="muted sans" style={{ ...emailStyles.label, margin: '0 0 16px' }}>
            What isn't there yet
          </h2>
          {props.knownLimitations.map((limitation) => (
            <p
              key={limitation}
              className="muted sans"
              style={{ ...emailStyles.item, margin: '0 0 12px', color: '#6E6A62' }}
            >
              {limitation}
            </p>
          ))}
          <p className="muted sans" style={{ ...emailStyles.item, margin: 0, color: '#6E6A62' }}>
            Telling us what breaks is the most useful thing you can do right now. Replying to this
            email reaches a person.
          </p>
        </EmailSpine>
      </EmailRow>
      <EmailRow padding="40px 40px 0">
        <p
          className="ink"
          style={{
            margin: 0,
            fontFamily: emailStyles.serif,
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: '24px',
            lineHeight: '1.3',
            color: '#1C1A16',
          }}
        >
          Structure creates freedom.
        </p>
      </EmailRow>
      <EmailFooter managementUrl={props.managementUrl} postalAddress={props.postalAddress}>
        You're receiving this because you asked for early access to Corpus. This is the email we
        promised.
      </EmailFooter>
    </EmailShell>
  );
}
