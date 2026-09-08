import { render } from '@react-email/components';
import { describe, expect, it } from 'vitest';
import { ConfirmationEmail } from './confirmation-email';
import { renderConfirmationEmailText } from './confirmation-email.text';
import { LaunchEmail } from './launch-email';

const common = {
  managementUrl: 'https://corpus.example/early-access/manage#synthetic-token',
  postalAddress: 'Synthetic verification address',
};

describe('authoritative email presentation', () => {
  it.each([
    ['confirmation', () => ConfirmationEmail(common)],
    [
      'launch',
      () =>
        LaunchEmail({
          ...common,
          releaseVersion: '1.0.0',
          releaseSummary: 'Capture a word in a second.',
          includedFeatures: ['Offline capture'],
          knownLimitations: ['Android only'],
          downloadUrl: new URL('https://downloads.corpus.example/v1'),
        }),
    ],
  ] as const)('%s preserves the masthead, spine, palette, and dark-mode hooks', async (_, email) => {
    const html = await render(email());

    expect(html).toMatch(/class="[^"]*masthead[^"]*"/);
    expect(html).toMatch(/<table[^>]*class="bg"[^>]*background-color:#F1EFE9/);
    expect(html).toMatch(/<td[^>]*class="spine"[^>]*border-left:1px solid #D1CFC9/);
    expect(html).toMatch(/<h1[^>]*class="[^"]*ink[^"]*"/);
    expect(html).toMatch(/<table[^>]*class="panel"[^>]*background-color:#FBFAF6/);
    expect(html).toContain('Newsreader');
    expect(html).toContain('Karla');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toMatch(/\.ink\s*\{\s*color:\s*#E7E4DD\s*!important/);
    expect(html).toMatch(/\.panel\s*\{\s*background-color:\s*#141419\s*!important/);
    expect(html).toMatch(/\.muted\s*\{\s*color:\s*#9A968D\s*!important/);
    expect(html).toContain(common.managementUrl);
    expect(html).toContain(common.postalAddress);
  });

  it('keeps the word, encounter history, and three learning steps in HTML and text', async () => {
    const html = (await render(ConfirmationEmail(common))).replaceAll('&#x27;', "'");
    const text = renderConfirmationEmailText(common);

    for (const copy of [
      'While you wait, a word',
      'adjective',
      '/ˈluːs(ə)nt/',
      'First encountered',
      'Heard in a podcast',
      'Met again',
      'Read in a novel, chapter 4',
      'Used by you',
      'In writing, 2 September',
      'one word is the whole requirement.',
      "the entry fills itself in, after you've moved on.",
      'five words a day, drawn from your own lexicon.',
    ]) {
      expect(html).toContain(copy);
      expect(text).toContain(copy);
    }
    for (const step of ['Capture', 'Enrich', 'Practice']) {
      expect(html).toMatch(new RegExp(`<strong[^>]*>${step}</strong>`));
    }
  });
});
