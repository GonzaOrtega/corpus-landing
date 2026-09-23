import { describe, expect, it } from 'vitest';
import { NEVER_LOG_FIXTURE, NEVER_LOG_FIXTURE_STRINGS } from './never-log-fixture';

describe('NEVER_LOG_FIXTURE_STRINGS', () => {
  it('sweeps every scalar value of the fixture, nested ones included, once each', () => {
    expect(NEVER_LOG_FIXTURE_STRINGS).toEqual(
      expect.arrayContaining([
        NEVER_LOG_FIXTURE.email,
        NEVER_LOG_FIXTURE.rawToken,
        NEVER_LOG_FIXTURE.manageTokenHash,
        NEVER_LOG_FIXTURE.captchaToken,
        String(NEVER_LOG_FIXTURE.captchaScore),
        NEVER_LOG_FIXTURE.providerResponseBody,
        NEVER_LOG_FIXTURE.databaseUrl,
        NEVER_LOG_FIXTURE.secret,
        NEVER_LOG_FIXTURE.formData.email,
      ]),
    );
    expect(new Set(NEVER_LOG_FIXTURE_STRINGS).size).toBe(NEVER_LOG_FIXTURE_STRINGS.length);
  });
});
