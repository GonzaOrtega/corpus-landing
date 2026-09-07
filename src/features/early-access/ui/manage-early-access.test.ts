import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManageEarlyAccess } from './manage-early-access';

describe('ManageEarlyAccess', () => {
  it('renders the exact active state with only the masked email', () => {
    const html = renderToStaticMarkup(
      createElement(ManageEarlyAccess, {
        state: { status: 'active', maskedEmail: 'g***@example.com' },
      }),
    );

    expect(html).toContain('Manage early access.');
    expect(html).toContain('g***@example.com');
    expect(html).not.toContain('gonza@example.com');
    expect(html).toContain('You&#x27;re on the Corpus early-access list.');
    expect(html).toContain(
      'We&#x27;ll send one launch notification when Corpus is ready. No newsletter.',
    );
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('Back to Corpus');
  });

  it('renders the approved unsubscribed and invalid-link states', () => {
    const unsubscribed = renderToStaticMarkup(
      createElement(ManageEarlyAccess, {
        state: { status: 'unsubscribed', maskedEmail: 'g***@example.com' },
      }),
    );
    expect(unsubscribed).toContain('You&#x27;re off the list.');
    expect(unsubscribed).toContain('You won&#x27;t receive the Corpus launch email.');

    const invalid = renderToStaticMarkup(
      createElement(ManageEarlyAccess, { state: { status: 'invalid' } }),
    );
    expect(invalid).toContain('This management link is no longer valid.');
  });
});
