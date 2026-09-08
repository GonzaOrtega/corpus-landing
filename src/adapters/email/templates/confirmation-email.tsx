import {
  EmailDiamond,
  EmailFooter,
  EmailPanel,
  EmailRow,
  EmailShell,
  EmailSpine,
  emailStyles,
} from './email-shell';

export interface ConfirmationEmailProps {
  managementUrl: string;
  postalAddress: string;
}

export function ConfirmationEmail({ managementUrl, postalAddress }: ConfirmationEmailProps) {
  return (
    <EmailShell preview="You're confirmed. We'll write once more when Corpus is ready to try.">
      <EmailRow>
        <EmailSpine>
          <p
            className="muted sans"
            style={{ ...emailStyles.muted, margin: '0 0 14px', fontSize: '13px' }}
          >
            Early access
          </p>
          <h1 className="h1 ink" style={emailStyles.heading}>
            You're on the list.
          </h1>
          <p className="ink sans" style={emailStyles.body}>
            Corpus is still in private development. You're confirmed for early access. We'll write
            again when there's a build worth trying. Early access begins on Android.
          </p>
          <p className="muted sans" style={{ ...emailStyles.muted, margin: '0 0 34px' }}>
            That's the whole commitment. No newsletter, no drip sequence.
          </p>
        </EmailSpine>
      </EmailRow>
      <EmailRow>
        <EmailPanel padding="30px 30px 26px">
          <p className="muted sans" style={{ ...emailStyles.label, margin: '0 0 20px' }}>
            While you wait, a word
          </p>
          <p style={{ margin: '0 0 4px' }}>
            <span
              className="word ink"
              style={{
                fontFamily: emailStyles.serif,
                fontSize: '36px',
                lineHeight: '1.1',
                letterSpacing: '-0.015em',
                color: '#1C1A16',
              }}
            >
              lucent
            </span>
            <span
              className="muted"
              style={{
                fontFamily: "Georgia,'Times New Roman',serif",
                fontStyle: 'italic',
                fontSize: '15px',
                color: '#6E6A62',
                paddingLeft: '8px',
              }}
            >
              adjective
            </span>
          </p>
          <p
            className="clay"
            style={{
              margin: '0 0 14px',
              fontFamily: "Georgia,'Times New Roman',serif",
              fontStyle: 'italic',
              fontSize: '17px',
              color: '#B0503A',
            }}
          >
            /ˈluːs(ə)nt/
          </p>
          <p
            className="ink sans"
            style={{ ...emailStyles.body, margin: '0 0 22px', fontSize: '15px' }}
          >
            clear enough for light to pass through
          </p>
          <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" border={0}>
            <tbody>
              <tr>
                <td className="rule" style={{ borderTop: '1px solid #E0DED8', paddingTop: '12px' }}>
                  <table
                    role="presentation"
                    width="100%"
                    cellPadding="0"
                    cellSpacing="0"
                    border={0}
                  >
                    <tbody>
                      {[
                        ['First encountered', 'Heard in a podcast'],
                        ['Met again', 'Read in a novel, chapter 4'],
                        ['Used by you', 'In writing, 2 September'],
                      ].map(([label, encounter], index) => (
                        <tr key={label}>
                          <td
                            className="stack stack-label muted sans"
                            width="130"
                            style={{
                              fontFamily: emailStyles.sans,
                              fontSize: '13px',
                              color: '#8A867D',
                              paddingBottom: index === 2 ? 0 : '12px',
                              verticalAlign: 'top',
                            }}
                          >
                            {label}
                          </td>
                          <td
                            className="stack ink"
                            style={{
                              fontFamily: "Georgia,'Times New Roman',serif",
                              fontSize: '16px',
                              color: '#2B2822',
                              paddingBottom: index === 2 ? 0 : '12px',
                              verticalAlign: 'top',
                            }}
                          >
                            {encounter}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </EmailPanel>
      </EmailRow>
      <EmailRow padding="36px 40px 0">
        <EmailSpine>
          {[
            ['Capture', 'one word is the whole requirement.'],
            ['Enrich', "the entry fills itself in, after you've moved on."],
            ['Practice', 'five words a day, drawn from your own lexicon.'],
          ].map(([step, detail], index) => (
            <p
              key={step}
              className="ink sans"
              style={{ ...emailStyles.item, margin: index === 2 ? 0 : '0 0 16px' }}
            >
              <EmailDiamond />
              {'  '}
              <strong style={{ fontWeight: 600 }}>{step}</strong>
              {' — '}
              {detail}
            </p>
          ))}
        </EmailSpine>
      </EmailRow>
      <EmailFooter managementUrl={managementUrl} postalAddress={postalAddress}>
        You're receiving this because you asked for early access to Corpus. We'll send one more
        email when there's a build worth trying.
      </EmailFooter>
    </EmailShell>
  );
}
