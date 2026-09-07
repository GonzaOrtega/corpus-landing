import { Html, Preview } from '@react-email/components';
import type { ReactNode } from 'react';

export const emailStyles = {
  serif: "'Newsreader',Georgia,'Times New Roman',serif",
  sans: "'Karla',Arial,sans-serif",
  heading: {
    margin: '0 0 20px',
    fontFamily: "'Newsreader',Georgia,'Times New Roman',serif",
    fontWeight: 400,
    fontSize: '40px',
    lineHeight: '1.02',
    letterSpacing: '-0.02em',
    color: '#1C1A16',
  },
  body: {
    margin: '0 0 16px',
    fontFamily: "'Karla',Arial,sans-serif",
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#2B2822',
  },
  muted: {
    fontFamily: "'Karla',Arial,sans-serif",
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#6E6A62',
  },
  label: {
    margin: '0 0 18px',
    fontFamily: "'Karla',Arial,sans-serif",
    fontWeight: 400,
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#8A867D',
  },
  item: {
    margin: '0 0 14px',
    fontFamily: "'Karla',Arial,sans-serif",
    fontSize: '15px',
    lineHeight: '1.65',
    color: '#2B2822',
  },
} as const;

// Static, trusted head markup preserves Outlook's conditional fallback stylesheet.
// Web fonts enhance the design; table layout and inline fallback fonts stand alone.
const emailHead = `
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300..600;1,300..500&family=Karla:wght@400;500;600&display=swap');
    body { margin: 0; padding: 0; width: 100% !important; }
    table { border-collapse: collapse; }
    @media only screen and (max-width: 620px) {
      .shell { width: 100% !important; }
      .pad { padding-left: 22px !important; padding-right: 22px !important; }
      .h1 { font-size: 32px !important; line-height: 1.08 !important; }
      .launch-h1 { font-size: 34px !important; line-height: 1.04 !important; }
      .word { font-size: 30px !important; }
      .stack { display: block !important; width: 100% !important; padding-left: 0 !important; }
      .stack-label { padding-bottom: 2px !important; }
      .btn a { display: block !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bg { background-color: #0F0F13 !important; }
      .panel { background-color: #141419 !important; }
      .ink { color: #E7E4DD !important; }
      .muted { color: #9A968D !important; }
      .clay { color: #D98368 !important; }
      .rule { border-color: #2E2E33 !important; }
      .spine { border-left-color: #2E2E33 !important; }
    }
  </style>
  <!--[if mso]><style>
    body, table, td, p, a, h1, h2 { font-family: Georgia, 'Times New Roman', serif !important; }
    .sans { font-family: Arial, sans-serif !important; }
  </style><![endif]-->
`;

export function EmailShell({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static head only; Outlook conditional comments cannot be expressed as JSX. */}
      <head dangerouslySetInnerHTML={{ __html: emailHead }} />
      <body className="bg" style={{ margin: 0, padding: 0, backgroundColor: '#F1EFE9' }}>
        <Preview>{preview}</Preview>
        <table
          role="presentation"
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          border={0}
          className="bg"
          style={{ backgroundColor: '#F1EFE9' }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 12px' }}>
                <table
                  role="presentation"
                  className="shell"
                  width="600"
                  cellPadding="0"
                  cellSpacing="0"
                  border={0}
                  style={{ width: '600px', maxWidth: '600px' }}
                >
                  <tbody>
                    <EmailRow padding="0 40px 30px">
                      <div className="masthead">
                        <EmailDiamond size={13} />
                        <span
                          className="ink"
                          style={{
                            fontFamily: emailStyles.serif,
                            fontSize: '19px',
                            color: '#1C1A16',
                            letterSpacing: '0.01em',
                            paddingLeft: '8px',
                            verticalAlign: 'middle',
                          }}
                        >
                          Corpus
                        </span>
                      </div>
                    </EmailRow>
                    {children}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  );
}

export function EmailRow({
  children,
  padding = '0 40px',
}: {
  children: ReactNode;
  padding?: string;
}) {
  return (
    <tr>
      <td className="pad" style={{ padding }}>
        {children}
      </td>
    </tr>
  );
}

export function EmailSpine({ children }: { children: ReactNode }) {
  return (
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" border={0}>
      <tbody>
        <tr>
          <td className="spine" style={{ borderLeft: '1px solid #D1CFC9', paddingLeft: '26px' }}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailPanel({
  children,
  padding = '28px 30px',
}: {
  children: ReactNode;
  padding?: string;
}) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      border={0}
      className="panel"
      style={{ backgroundColor: '#FBFAF6' }}
    >
      <tbody>
        <tr>
          <td style={{ padding }}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailDiamond({ size = 11 }: { size?: number }) {
  return (
    <span
      className="clay"
      style={{
        fontFamily: 'Georgia,serif',
        fontSize: `${size}px`,
        color: '#B0503A',
        verticalAlign: 'middle',
      }}
    >
      ◆
    </span>
  );
}

export function EmailFooter({
  children,
  managementUrl,
  postalAddress,
}: {
  children: ReactNode;
  managementUrl: string;
  postalAddress: string;
}) {
  const style = { ...emailStyles.muted, fontSize: '13px', color: '#8A867D' };
  return (
    <EmailRow padding="40px 40px 20px">
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" border={0}>
        <tbody>
          <tr>
            <td className="rule" style={{ borderTop: '1px solid #E0DED8', paddingTop: '20px' }}>
              <p className="muted sans" style={{ ...style, margin: '0 0 10px' }}>
                {children}
              </p>
              <p className="muted sans" style={{ ...style, margin: 0 }}>
                <a
                  className="muted"
                  href={managementUrl}
                  style={{ color: '#8A867D', textDecoration: 'underline' }}
                >
                  Manage early access
                </a>
                {' · Corpus · '}
                {postalAddress}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailRow>
  );
}
