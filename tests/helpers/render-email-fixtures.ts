import { render } from '@react-email/components';
import { ConfirmationEmail } from '../../src/adapters/email/templates/confirmation-email';
import { LaunchEmail } from '../../src/adapters/email/templates/launch-email';

const common = {
  managementUrl: 'https://corpus.example/early-access/manage#synthetic-token',
  postalAddress: 'Synthetic verification address',
};

// Use the real JSX runtime; Playwright's transform treats JSX as component-test nodes.
const confirmation = await render(ConfirmationEmail(common));
const launch = await render(
  LaunchEmail({
    ...common,
    releaseVersion: '1.0.0',
    releaseSummary: 'Capture a word in a second and make it yours.',
    includedFeatures: ['Offline capture', 'Daily practice'],
    knownLimitations: ['Android only'],
    downloadUrl: new URL('https://downloads.corpus.example/v1'),
  }),
);
process.stdout.write(JSON.stringify({ confirmation, launch }));
