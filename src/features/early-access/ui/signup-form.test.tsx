import { useActionState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignupActionState } from '../actions/join-early-access.action';

vi.mock('../actions/join-early-access.action', () => ({
  joinEarlyAccessAction: async () => ({ status: 'idle' }),
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: vi.fn(),
}));

import { SignupForm } from './signup-form';

afterEach(() => vi.resetAllMocks());

describe('signup result presentation', () => {
  it.each<[Exclude<SignupActionState, { status: 'idle' }>, string]>([
    [{ status: 'success', message: "You're on the list." }, 'ok'],
    [{ status: 'invalid-email', message: 'Check that address.' }, 'error'],
    [{ status: 'retry', message: 'Try again in a moment.' }, 'error'],
    [{ status: 'closed' }, 'error'],
  ])('renders %j with the matching result style', (state, expected) => {
    vi.mocked(useActionState).mockReturnValue([state, vi.fn(), false]);

    const html = renderToStaticMarkup(<SignupForm recaptchaSiteKey={null} />);
    const output = html.match(/<output\b[^>]*>[\s\S]*?<\/output>/)?.[0];

    expect(output).toContain(`data-state="${expected}"`);
    expect(output).toContain('aria-live="polite"');
    expect(output).toContain('aria-atomic="true"');
    expect(output).toContain(
      state.status === 'closed'
        ? 'Early access is no longer open.'
        : state.message.replaceAll("'", '&#x27;'),
    );
  });

  it('keeps the idle output empty without success or error styling', () => {
    vi.mocked(useActionState).mockReturnValue([{ status: 'idle' }, vi.fn(), false]);
    const html = renderToStaticMarkup(<SignupForm recaptchaSiteKey={null} />);
    const output = html.match(/<output\b[^>]*>[\s\S]*?<\/output>/)?.[0];
    expect(output).toMatch(/><\/output>$/);
    expect(output).not.toContain('data-state');
  });
});
