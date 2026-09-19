import type { ErrorEvent, Event, Log } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { NEVER_LOG_FIXTURE, NEVER_LOG_FIXTURE_STRINGS } from '../core/testing/never-log-fixture';
import {
  buildClientSentryOptions,
  buildSentryBuildOptions,
  buildServerSentryOptions,
  redactText,
  resolveTracesSampleRate,
  scrubEvent,
  scrubLog,
} from './sentry-options';

/**
 * The same never-log list `pino-logger.adapter.test.ts` enforces (spec §24),
 * pushed through every Sentry hook that could carry it. Values are shaped like
 * the real thing so a regex that only matched the key name would not pass.
 * Sourced from the shared fixture (spec decision 2) so the two suites cannot
 * drift apart again.
 */
const FORBIDDEN = NEVER_LOG_FIXTURE;
const forbiddenStrings = NEVER_LOG_FIXTURE_STRINGS;

function expectClean(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of forbiddenStrings) expect(serialized).not.toContain(forbidden);
}

describe('redactText', () => {
  it('replaces email addresses and credential query parameters inside free text', () => {
    expect(redactText('Failed for Person.Name+tag@Example.co.uk today')).toBe(
      'Failed for [email] today',
    );
    expect(redactText('https://recaptchaenterprise.googleapis.com/v1/assess?key=AIza123&x=1')).toBe(
      'https://recaptchaenterprise.googleapis.com/v1/assess?key=[redacted]&x=1',
    );
    // R-01/R-14: a URL fragment must never survive redaction — it is the
    // *only* place this product's credential travels (`managementUrl.hash`
    // in send-confirmation-email.use-case.ts and launch-production.ts), and
    // none of the other patterns here ever match a `#`-anchored tail.
    expect(redactText('https://site/manage?token=abc#frag')).toBe(
      'https://site/manage?token=[redacted]#[redacted]',
    );
    expect(redactText('connect ECONNREFUSED postgres://corpus:s3cret@ep-x.neon.tech/db')).toBe(
      'connect ECONNREFUSED postgres://[credentials]@ep-x.neon.tech/db',
    );
  });

  it('redacts a realistic management-link fragment carrying the raw token', () => {
    expect(redactText(`https://corpus.example/early-access/manage#${FORBIDDEN.rawToken}`)).toBe(
      'https://corpus.example/early-access/manage#[redacted]',
    );
  });

  it('redacts the first parameter of a bare query string with no leading "?" or "&" (how the SDK populates request.query_string)', () => {
    expect(redactText(`token=${FORBIDDEN.rawToken}&x=1`)).toBe('token=[redacted]&x=1');
  });
});

describe('scrubEvent', () => {
  it('drops request bodies, cookies, headers and user identity entirely', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://corpus.example/',
        method: 'POST',
        data: FORBIDDEN.formData,
        cookies: { session: FORBIDDEN.secret },
        headers: { authorization: `Bearer ${FORBIDDEN.secret}`, cookie: FORBIDDEN.secret },
      },
      user: { ip_address: '203.0.113.7', email: FORBIDDEN.email },
    });

    expect(scrubbed.request).toEqual({ url: 'https://corpus.example/', method: 'POST' });
    expect(scrubbed).not.toHaveProperty('user');
    expectClean(scrubbed);
  });

  it('redacts forbidden values wherever they appear, at any depth', () => {
    const scrubbed = scrubEvent({
      message: `Signup failed for ${FORBIDDEN.email}`,
      exception: {
        values: [{ type: 'Error', value: `insert into signups (${FORBIDDEN.email}) failed` }],
      },
      breadcrumbs: [
        {
          category: 'fetch',
          message: `POST ${FORBIDDEN.databaseUrl}`,
          data: { url: `https://google.example/assess?key=${FORBIDDEN.secret}` },
        },
      ],
      spans: [
        {
          span_id: '1',
          trace_id: '2',
          start_timestamp: 0,
          description: `GET https://resend.example/emails?token=${FORBIDDEN.rawToken}`,
          data: { 'http.url': `https://x/?email=${FORBIDDEN.email}` },
        },
      ],
      extra: { ...FORBIDDEN },
      tags: { operation: 'join_early_access', signupId: 'uuid-1' },
    });

    expectClean(scrubbed);
    expect(scrubbed.tags).toEqual({ operation: 'join_early_access', signupId: 'uuid-1' });
    expect(scrubbed.exception?.values?.[0]?.value).toBe('insert into signups ([email]) failed');
  });

  it('re-applies the logger allowlist to what the Pino integration attached', () => {
    const scrubbed = scrubEvent({
      contexts: {
        pino: {
          operation: 'send_confirmation',
          signupId: 'uuid-1',
          attemptCount: 2,
          email: FORBIDDEN.email,
          rawToken: FORBIDDEN.rawToken,
          providerResponseBody: FORBIDDEN.providerResponseBody,
        },
        trace: { trace_id: 'abc', span_id: 'def' },
      },
    });

    expect(scrubbed.contexts?.pino).toEqual({
      operation: 'send_confirmation',
      signupId: 'uuid-1',
      attemptCount: 2,
    });
    expect(scrubbed.contexts?.trace).toEqual({ trace_id: 'abc', span_id: 'def' });
  });

  it('reduces request.url to origin+pathname, dropping the query and fragment (R-01/R-14: the fragment is where the management token travels)', () => {
    // The browser SDK's HttpContext integration fills `request.url` from
    // `document.location.href` — fragment included. A failed render of
    // `ManageTokenBridge` (manage-token-bridge.tsx) never reaches the client
    // effect that strips the hash, so the raw token can still be sitting in
    // the URL when this event is built. Reducing to origin+pathname removes
    // it structurally, rather than relying on a regex to catch every shape.
    const scrubbed = scrubEvent({
      request: {
        url: `https://corpus.example/early-access/manage?ref=confirmation-email#${FORBIDDEN.rawToken}`,
        method: 'GET',
      },
    });

    expect(scrubbed.request).toEqual({
      url: 'https://corpus.example/early-access/manage',
      method: 'GET',
    });
    expectClean(scrubbed);
  });

  it('redacts the first parameter of a bare request.query_string (R-14: the SDK populates it via URL.search.slice(1), with no leading "?")', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://corpus.example/early-access/manage',
        method: 'GET',
        query_string: `token=${FORBIDDEN.rawToken}&x=1`,
      },
    });

    expect(scrubbed.request?.query_string).toBe('token=[redacted]&x=1');
    expectClean(scrubbed);
  });
});

describe('scrubLog', () => {
  it('redacts the message and drops forbidden attributes from pino and console logs', () => {
    const scrubbed = scrubLog({
      level: 'error',
      message: `Email provider rejected ${FORBIDDEN.email}`,
      attributes: { ...FORBIDDEN, operation: 'send_confirmation', 'sentry.origin': 'auto.pino' },
    });

    expectClean(scrubbed);
    expect(scrubbed.message).toBe('Email provider rejected [email]');
    expect(scrubbed.attributes).toEqual({
      operation: 'send_confirmation',
      'sentry.origin': 'auto.pino',
    });
  });
});

describe('resolveTracesSampleRate', () => {
  it.each([
    ['unset in production', undefined, 'production', 0.1],
    ['unset in preview', undefined, 'preview', 1],
    ['unset locally', undefined, undefined, 1],
    ['blank', '', 'production', 0.1],
    ['the Vercel sensitive placeholder', '[SENSITIVE]', 'production', 0.1],
    ['a valid override', '0.25', 'production', 0.25],
    ['zero', '0', 'preview', 0],
    ['out of range', '7', 'production', 0.1],
    ['not a number', 'lots', 'production', 0.1],
  ])('handles %s', (_label, raw, environment, expected) => {
    expect(resolveTracesSampleRate(raw, environment)).toBe(expected);
  });
});

describe('buildServerSentryOptions', () => {
  const dsn = 'https://public@o1.ingest.sentry.io/1';
  const developerMachine = {
    NODE_ENV: 'development',
    CI: undefined,
    E2E_NEON_HTTP_ENDPOINT: undefined,
  };

  it.each([
    ['CI', { CI: 'true' }],
    ['NODE_ENV=test', { NODE_ENV: 'test' }],
    ['E2E_NEON_HTTP_ENDPOINT', { E2E_NEON_HTTP_ENDPOINT: 'http://proxy:4444/sql' }],
  ])('stays disabled in the pipeline (%s) even with a DSN', (_label, env) => {
    const options = buildServerSentryOptions({
      ...developerMachine,
      ...env,
      NEXT_PUBLIC_SENTRY_DSN: dsn,
    });
    expect(options.enabled).toBe(false);
  });

  it('is disabled without a DSN and enabled with one outside the pipeline', () => {
    expect(buildServerSentryOptions({ ...developerMachine }).enabled).toBe(false);
    expect(
      buildServerSentryOptions({ ...developerMachine, NEXT_PUBLIC_SENTRY_DSN: '' }).enabled,
    ).toBe(false);
    expect(
      buildServerSentryOptions({ ...developerMachine, NEXT_PUBLIC_SENTRY_DSN: dsn }).enabled,
    ).toBe(true);
  });

  it('collects nothing the SDK would otherwise gather on its own', () => {
    const options = buildServerSentryOptions({ ...developerMachine, NEXT_PUBLIC_SENTRY_DSN: dsn });
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
    expect(options.enableLogs).toBe(true);
    expect(options.initialScope.tags).toEqual({
      release_stage: 'early-access',
      vercel_env: 'local',
    });
  });

  it('tags the deployment and release stage', () => {
    const options = buildServerSentryOptions({
      ...developerMachine,
      NEXT_PUBLIC_SENTRY_DSN: dsn,
      VERCEL_ENV: 'production',
      CORPUS_RELEASE_STAGE: 'launched',
    });
    expect(options.initialScope.tags).toEqual({
      release_stage: 'launched',
      vercel_env: 'production',
    });
    expect(options.tracesSampleRate).toBe(0.1);
  });
});

describe('buildClientSentryOptions', () => {
  const dsn = 'https://public@o1.ingest.sentry.io/1';

  it('is switched by the inlined DSN alone and never sends client reports', () => {
    expect(buildClientSentryOptions({}).enabled).toBe(false);
    expect(buildClientSentryOptions({ NEXT_PUBLIC_SENTRY_DSN: '' }).enabled).toBe(false);
    const enabled = buildClientSentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn });
    expect(enabled.enabled).toBe(true);
    expect(enabled.sendClientReports).toBe(false);
  });

  // The Lighthouse gate: browser tracing is the one piece that costs
  // performance points, so it is off until a deployment asks for it.
  it('leaves browser tracing off unless a valid rate is set explicitly', () => {
    expect(
      buildClientSentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn }).tracesSampleRate,
    ).toBeUndefined();
    expect(
      buildClientSentryOptions({
        NEXT_PUBLIC_SENTRY_DSN: dsn,
        NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE: 'lots',
      }).tracesSampleRate,
    ).toBeUndefined();
    expect(
      buildClientSentryOptions({
        NEXT_PUBLIC_SENTRY_DSN: dsn,
        NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE: '0.2',
      }).tracesSampleRate,
    ).toBe(0.2);
  });
});

/**
 * R-12: every scrubber test above calls `scrubEvent`/`scrubLog`/`redactText`
 * as free functions, so deleting a wiring line in `sharedOptions` (the
 * `beforeSend`/`beforeSendTransaction`/`beforeSendLog` hooks Sentry.init
 * actually receives) would ship every event unscrubbed with the rest of this
 * suite fully green. These assert on the *built* options objects instead —
 * the same objects `sentry.server.config.ts`, `sentry.edge.config.ts` (both
 * call `buildServerSentryOptions`) and `instrumentation-client.ts` (via
 * `buildClientSentryOptions`) pass to `Sentry.init`.
 */
describe('sharedOptions wiring on the built options', () => {
  const dsn = 'https://public@o1.ingest.sentry.io/1';

  function expectHooksAreWiredAndScrub(options: {
    beforeSend: (event: ErrorEvent) => Event;
    beforeSendTransaction: <E extends Event>(event: E) => E;
    beforeSendLog: (log: Log) => Log;
    ignoreErrors: ReadonlyArray<string | RegExp>;
  }): void {
    expect(options.beforeSend).toBeTypeOf('function');
    expect(options.beforeSendTransaction).toBeTypeOf('function');
    expect(options.beforeSendLog).toBeTypeOf('function');

    const sentEvent = options.beforeSend({
      type: undefined,
      user: { email: FORBIDDEN.email },
      request: { url: 'https://corpus.example/', method: 'POST', data: FORBIDDEN.formData },
      extra: { ...FORBIDDEN },
    });
    expect(sentEvent).not.toHaveProperty('user');
    expectClean(sentEvent);

    const sentTransaction = options.beforeSendTransaction({
      transaction: 'GET /',
      extra: { ...FORBIDDEN },
    });
    expectClean(sentTransaction);

    const sentLog = options.beforeSendLog({
      level: 'error',
      message: `Email provider rejected ${FORBIDDEN.email}`,
      attributes: { ...FORBIDDEN },
    });
    expect(sentLog.message).toBe('Email provider rejected [email]');
    expectClean(sentLog);

    expect(options.ignoreErrors).toContain('The operation was aborted');
  }

  it('wires beforeSend, beforeSendTransaction and beforeSendLog that actually scrub (server — sentry.edge.config.ts shares this same builder)', () => {
    const options = buildServerSentryOptions({
      NODE_ENV: 'development',
      CI: undefined,
      E2E_NEON_HTTP_ENDPOINT: undefined,
      NEXT_PUBLIC_SENTRY_DSN: dsn,
    });
    expectHooksAreWiredAndScrub(options);
  });

  it('wires beforeSend, beforeSendTransaction and beforeSendLog that actually scrub (client)', () => {
    const options = buildClientSentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn });
    expectHooksAreWiredAndScrub(options);
  });
});

describe('buildSentryBuildOptions', () => {
  it('uploads source maps and creates releases only from a Vercel build with a real token', () => {
    const vercel = buildSentryBuildOptions({
      SENTRY_ORG: 'corpus',
      SENTRY_PROJECT: 'landing',
      SENTRY_AUTH_TOKEN: 'sntrys_real',
      VERCEL_ENV: 'production',
      CI: 'true',
    });
    expect(vercel).toMatchObject({
      org: 'corpus',
      project: 'landing',
      authToken: 'sntrys_real',
      sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
      release: { create: true, finalize: true },
      tunnelRoute: '/monitoring',
      telemetry: false,
      silent: false,
    });
  });

  it.each([
    ['no VERCEL_ENV (E2E container, laptop)', { SENTRY_AUTH_TOKEN: 'sntrys_real' }],
    ['no token', { VERCEL_ENV: 'preview' }],
    ['a blank token', { VERCEL_ENV: 'preview', SENTRY_AUTH_TOKEN: '' }],
    [
      'the Vercel sensitive placeholder',
      { VERCEL_ENV: 'preview', SENTRY_AUTH_TOKEN: '[SENSITIVE]' },
    ],
  ])('disables upload and release creation with %s', (_label, env) => {
    const options = buildSentryBuildOptions(env);
    expect(options.authToken).toBeUndefined();
    expect(options.sourcemaps).toEqual({ disable: true, deleteSourcemapsAfterUpload: true });
    expect(options.release).toEqual({ create: false, finalize: false });
    expect(options.silent).toBe(true);
  });

  it('turns an upload failure into a warning rather than a failed build', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => {
      warnings.push(message);
    };
    try {
      expect(() =>
        buildSentryBuildOptions({}).errorHandler?.(new Error('sentry.io unreachable')),
      ).not.toThrow();
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual([
      'Sentry build step failed; continuing without it: sentry.io unreachable',
    ]);
  });
});
