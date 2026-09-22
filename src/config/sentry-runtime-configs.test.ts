import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `sentry.server.config.ts` and `sentry.edge.config.ts` (repo root) are the
 * only two callers of `buildServerSentryOptions` that actually reach
 * `Sentry.init` — sentry-options.test.ts proves the builder's output scrubs,
 * but nothing asserted either config file forwards that output intact
 * rather than dropping it or bolting on a forbidden integration (R-33,
 * same gap as sentry-client.test.ts had for the browser side). Both files
 * run `Sentry.init` as a top-level side effect on import, so each test
 * imports fresh after `vi.resetModules()`.
 */

const init = vi.fn();
const pinoIntegration = vi.fn((...args: unknown[]) => ({ name: 'pino', options: args[0] }));
vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => init(...args),
  pinoIntegration: (...args: unknown[]) => pinoIntegration(...args),
}));

const buildServerSentryOptions = vi.fn();
vi.mock('./sentry-options', () => ({
  buildServerSentryOptions: (...args: unknown[]) => buildServerSentryOptions(...args),
}));

function fakeScrubbedOptions() {
  return {
    enabled: true,
    dsn: 'https://example.test',
    beforeSend: vi.fn(),
    beforeSendTransaction: vi.fn(),
    beforeSendLog: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  init.mockClear();
  pinoIntegration.mockClear();
  buildServerSentryOptions.mockReset();
});

describe('sentry.server.config', () => {
  it('passes buildServerSentryOptions straight through to init, scrub hooks included, plus only the pino integration', async () => {
    const options = fakeScrubbedOptions();
    buildServerSentryOptions.mockReturnValue(options);

    await import('../../sentry.server.config');

    expect(init).toHaveBeenCalledTimes(1);
    const initArg = init.mock.calls[0]?.[0] as Record<string, unknown>;
    // Every builder-produced key, the scrub hooks included, must reach
    // `Sentry.init` by reference — dropping the `...buildServerSentryOptions(...)`
    // spread would leave `initArg` as just `{ integrations }`.
    expect(initArg).toMatchObject(options);
    // Exactly one integration: pino. A second entry (Session Replay, the
    // feedback widget, or anything else forbidden by spec §25) fails this.
    expect(initArg.integrations).toEqual([
      { name: 'pino', options: { error: { levels: ['error'] } } },
    ]);
  });
});

describe('sentry.edge.config', () => {
  it('passes buildServerSentryOptions straight through to init with no integrations appended', async () => {
    const options = fakeScrubbedOptions();
    buildServerSentryOptions.mockReturnValue(options);

    await import('../../sentry.edge.config');

    expect(init).toHaveBeenCalledTimes(1);
    // No spread here in the source — the builder's return value is passed
    // directly, so this can assert exact identity of every key including
    // the scrub hooks, with nothing added or dropped in between.
    expect(init).toHaveBeenCalledWith(options);
  });
});
