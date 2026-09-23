import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ManageEarlyAccessPage, { metadata } from './page';

describe('Manage early access page', () => {
  it('is never indexed or followed: the URL fragment carries a bearer token', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('server-renders the loading state so the token is read only on the client', () => {
    const html = renderToStaticMarkup(<ManageEarlyAccessPage />);

    expect(html).toContain('Checking your management link…');
    expect(html).not.toContain('Unsubscribe');
  });
});
