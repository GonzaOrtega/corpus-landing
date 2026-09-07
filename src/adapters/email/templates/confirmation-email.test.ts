import { render } from '@react-email/components';
import { describe, expect, it } from 'vitest';
import { ConfirmationEmail } from './confirmation-email';
import { renderConfirmationEmailText } from './confirmation-email.text';

const props = {
  managementUrl: 'https://corpus.example/early-access/manage#opaque-token',
  postalAddress: 'Corpus · Buenos Aires, Argentina',
};

describe('confirmation email templates', () => {
  it('renders the approved HTML contract and management link', async () => {
    const html = await render(ConfirmationEmail(props));
    const visibleHtml = html.replaceAll('&#x27;', "'");

    for (const text of [
      "You're confirmed. We'll write once more when Corpus is ready to try.",
      "You're on the list.",
      "Corpus is still in private development. You're confirmed for early access.",
      "That's the whole commitment. No newsletter, no drip sequence.",
      'lucent',
      'Capture',
      'Enrich',
      'Practice',
      'Manage early access',
      'Corpus · Buenos Aires, Argentina',
    ]) {
      expect(visibleHtml).toContain(text);
    }
    expect(html).toContain(props.managementUrl);
  });

  it('renders an explicit plain-text version with the same meaning', () => {
    const text = renderConfirmationEmailText(props);

    expect(text).toContain("You're on the list for Corpus");
    expect(text).toContain("We'll write again when there's a build worth trying.");
    expect(text).toContain('Capture · Enrich · Practice');
    expect(text).toContain(`Manage early access: ${props.managementUrl}`);
    expect(text).toContain(props.postalAddress);
    expect(text).not.toContain('<');
  });
});
