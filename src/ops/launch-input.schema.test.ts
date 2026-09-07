import { describe, expect, it } from 'vitest';
import { launchInputSchema } from './launch-input.schema';

describe('launchInputSchema', () => {
  it('accepts typed release content and an HTTPS destination', () => {
    const parsed = launchInputSchema.parse({
      releaseVersion: '1.0.0',
      releaseSummary: 'First build.',
      includedFeatures: ['Offline capture'],
      knownLimitations: ['Android only'],
      downloadUrl: 'https://downloads.corpus.example/v1',
    });
    expect(parsed.downloadUrl).toEqual(new URL('https://downloads.corpus.example/v1'));
  });

  it('rejects arbitrary/insecure destinations and missing structured sections', () => {
    expect(() =>
      launchInputSchema.parse({
        releaseVersion: '1.0.0',
        releaseSummary: '<script>body</script>',
        includedFeatures: [],
        knownLimitations: [],
        downloadUrl: 'http://downloads.example/v1',
      }),
    ).toThrow();
  });
});
