import { describe, expect, it } from 'vitest';
import { renderLaunchEmail } from '../../../ops/render-launch-email';

const input = {
  releaseVersion: '1.0.0',
  releaseSummary: 'Capture a word in a second and make it yours.',
  includedFeatures: ['Offline capture', 'Daily practice'],
  knownLimitations: ['Android only', 'Rare words can be slower'],
  downloadUrl: new URL('https://downloads.corpus.example/v1'),
};

describe('launch email', () => {
  it('renders the approved hierarchy in HTML and explicit plain text', async () => {
    const rendered = await renderLaunchEmail(input, {
      managementUrl: 'https://corpus.example/early-access/manage#token',
      postalAddress: 'Corpus · Buenos Aires, Argentina',
    });

    expect(rendered.subject).toBe('Corpus is ready to try');
    for (const copy of [
      "It's ready to try.",
      'Get Corpus',
      'In the first build',
      "What isn't there yet",
      'Replying to this email reaches a person.',
      'Structure creates freedom.',
      'Manage early access',
    ]) {
      expect(rendered.html.replaceAll('&#x27;', "'")).toContain(copy);
      expect(rendered.text).toContain(copy);
    }
    expect(rendered.html).toContain(input.downloadUrl.toString());
    expect(rendered.html).not.toContain('Google Play');
    expect(rendered.text).not.toContain('same address');
    expect(rendered.text).not.toContain('access is tied');
  });
});
