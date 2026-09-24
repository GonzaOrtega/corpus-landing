import type { ErrorEvent, Event, Log } from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';
import { NEVER_LOG_FIXTURE, NEVER_LOG_FIXTURE_STRINGS } from '../core/testing/never-log-fixture';
import {
  buildClientSentryOptions,
  buildIngestUrl,
  buildSentryBuildOptions,
  buildServerSentryOptions,
  buildTunnelPath,
  describeDsnProblem,
  parseSentryDsn,
  redactText,
  resolveTracesSampleRate,
  scrubEvent,
  scrubLog,
  warnOnDsnProblem,
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
    expect(redactText('fetch https://corpus:s3cret@api.example/v1 failed')).toBe(
      'fetch https://[credentials]@api.example/v1 failed',
    );
  });

  it('redacts an address whose local part is longer than 64 characters, whole (R-18)', () => {
    // `signup.schema.ts` caps an address at 254 characters and caps nothing
    // below that, so a local part far past RFC 5321's 64 is accepted, stored,
    // and quoted back in exactly the free text this rule exists for. A rule
    // bounded at 64 matches only the tail and ships the head in the clear.
    const address = `${'a'.repeat(242)}@example.com`;
    expect(address).toHaveLength(254);
    expect(redactText(`Email provider rejected ${address}`)).toBe(
      'Email provider rejected [email]',
    );
    // Over the bound and glued to a neighbour: both still go, whole.
    expect(redactText(`${'b'.repeat(300)}@example.com-${'c'.repeat(300)}@example.org`)).toBe(
      '[email][email]',
    );
    // A long *domain* is no different: the address is dropped end to end.
    expect(redactText(`bounce for person@${'sub.'.repeat(60)}example.com`)).toBe(
      'bounce for [email]',
    );
  });

  it('drops a database connection string whole, host and database name included (R-25: spec §24 lists the connection string)', () => {
    const redacted = redactText(
      'connect ECONNREFUSED postgresql://corpus:s3cret@ep-x.neon.tech/db?sslmode=require',
    );
    expect(redacted).toBe('connect ECONNREFUSED postgres://[redacted]');
    expect(redactText(`driver said: ${FORBIDDEN.databaseUrl}`)).toBe(
      'driver said: postgres://[redacted]',
    );
  });

  it.each([
    ['the bare location.hash', `#${FORBIDDEN.rawToken}`],
    ['a selector DOMException', `'#${FORBIDDEN.rawToken}' is not a valid selector`],
    ['a path with no slash', `manage#${FORBIDDEN.rawToken}`],
    ['a path split by a quote', `https://site/early-access/manage'#${FORBIDDEN.rawToken}`],
    ['a backslash path', `site\\early-access\\manage#${FORBIDDEN.rawToken}`],
    ['a URL-encoded hash', `/early-access/manage%23${FORBIDDEN.rawToken}`],
  ])('redacts a token-shaped fragment with no URL in front of it: %s', (_label, text) => {
    expect(redactText(text)).not.toContain(FORBIDDEN.rawToken);
  });

  it.each([
    ['after a hyphen', '-https://admin:hunter2@localhost/x', '-https://[credentials]@localhost/x'],
    [
      'with a scheme over 32 characters',
      `${'x'.repeat(40)}://admin:hunter2@h`,
      `${'x'.repeat(8)}${'x'.repeat(32)}://[credentials]@h`,
    ],
    [
      'glued to a digit',
      '1.postgres://owner:npg_SECRET@ep-x.neon.tech/db',
      '1.postgres://[redacted]',
    ],
    [
      'glued to a previous match',
      'a@b.com.x@c.com and first@a.com-second@b.com',
      '[email][email] and [email][email]',
    ],
  ])('still redacts a credential or address %s', (_label, text, expected) => {
    expect(redactText(text)).toBe(expected);
  });

  it('redacts a fragment on a relative path too — the shape a navigation breadcrumb records', () => {
    expect(redactText(`/early-access/manage#${FORBIDDEN.rawToken}`)).toBe(
      '/early-access/manage#[redacted]',
    );
  });

  it.each([
    ['a clicked element selector', 'body > main > form > button#submit.primary'],
    ['a minified React error', 'Minified React error #418; visit the docs for the full message'],
    ['a colour', 'unexpected colour #fff in theme'],
  ])('leaves a "#" that is not part of a URL alone: %s (R-32/R-42)', (_label, text) => {
    expect(redactText(text)).toBe(text);
  });

  it.each([
    ['a long run of address characters', 'a'.repeat(100_000)],
    ['an "@" followed by a long run of hyphens', `a@${'-'.repeat(100_000)}`],
    ['a long run of scheme-like labels', 'a.'.repeat(50_000)],
    ['a scheme followed by a long run with no "@"', `x://${'a'.repeat(100_000)}`],
    // The address rule walks "@" signs rather than bounding the local part
    // (R-18), so these two shapes are what could make it quadratic instead.
    ['an "@"-dense block', '@a'.repeat(100_000)],
    ['a single unbroken token ending in an address', `${'a'.repeat(200_000)}@example.com`],
  ])('stays linear on %s (R-41)', (_label, text) => {
    const started = performance.now();
    redactText(text);
    expect(performance.now() - started).toBeLessThan(250);
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

  it('drops request.query_string structurally, like the query in request.url (R-14/R-24)', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://corpus.example/early-access/manage',
        method: 'GET',
        query_string: `token=${FORBIDDEN.rawToken}&x=1`,
      },
    });

    expect(scrubbed.request).not.toHaveProperty('query_string');
    expectClean(scrubbed);
  });

  it('replaces anything nested past the depth limit instead of passing it through unscrubbed (R-20)', () => {
    let deep: Record<string, unknown> = { email: FORBIDDEN.email, note: FORBIDDEN.secret };
    for (let level = 0; level < 13; level += 1) deep = { next: deep };

    const scrubbed = scrubEvent({ extra: { deep } });

    expectClean(scrubbed);
    expect(JSON.stringify(scrubbed)).toContain('"[depth-limit]"');
  });

  /**
   * R-26/R-43/R-44: a browser error on the management page, shaped the way
   * the browser SDK builds it. The token can sit in three places besides the
   * page URL: the navigation breadcrumb the bridge's `replaceState` records,
   * and the frame filename of an error thrown from an inline script.
   */
  it('removes the management token from every field a browser event on the manage page carries it in', () => {
    const managePage = `https://corpus.example/early-access/manage#${FORBIDDEN.rawToken}`;
    const scrubbed = scrubEvent({
      request: {
        url: managePage,
        headers: { Referer: managePage, 'User-Agent': 'Mozilla/5.0' },
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: { from: `/early-access/manage#${FORBIDDEN.rawToken}`, to: '/early-access/manage' },
        },
        { category: 'ui.click', message: 'main > form > button#unsubscribe' },
      ],
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'x is undefined',
            stacktrace: {
              frames: [
                { filename: managePage, abs_path: managePage, function: 'inline', lineno: 1 },
                { filename: 'app:///_next/static/chunks/app.js', function: 'render', lineno: 9 },
              ],
            },
          },
        ],
      },
      transaction: '/early-access/manage',
    });

    expectClean(scrubbed);
    expect(scrubbed.request).toEqual({ url: 'https://corpus.example/early-access/manage' });
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({
      from: '/early-access/manage',
      to: '/early-access/manage',
    });
    expect(scrubbed.breadcrumbs?.[1]?.message).toBe('main > form > button#unsubscribe');
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      {
        filename: 'https://corpus.example/early-access/manage',
        abs_path: 'https://corpus.example/early-access/manage',
        function: 'inline',
        lineno: 1,
      },
      { filename: 'app:///_next/static/chunks/app.js', function: 'render', lineno: 9 },
    ]);
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

describe('scrubEvent and scrubLog on sparse input', () => {
  it('leaves absent fields absent rather than inventing them', () => {
    const scrubbed = scrubEvent({
      request: { method: 'GET' },
      breadcrumbs: [
        { category: 'navigation' },
        { category: 'navigation', data: { from: '/a?x=1', to: 7 } },
      ],
      exception: { values: [{ type: 'Error' }, { stacktrace: { frames: [{ lineno: 3 }] } }] },
    });

    expect(scrubbed.request).toEqual({ method: 'GET' });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'navigation' },
      { category: 'navigation', data: { from: '/a', to: 7 } },
    ]);
    expect(scrubbed.exception?.values).toEqual([
      { type: 'Error' },
      { stacktrace: { frames: [{ lineno: 3 }] } },
    ]);
    expect(scrubLog({ level: 'info', message: 'started' })).toEqual({
      level: 'info',
      message: 'started',
    });
  });
});

describe('scrubLog — Pino records', () => {
  it('keeps only allowlisted fields and SDK metadata from a Pino record, not merely non-denied ones (R-10)', () => {
    const scrubbed = scrubLog({
      level: 'error',
      message: 'Confirmation email failed',
      attributes: {
        'sentry.origin': 'auto.log.pino',
        'sentry.environment': 'production',
        'pino.logger.level': 50,
        operation: 'send_confirmation',
        signupId: 'uuid-1',
        customerNote: 'free text a logger attached',
        'sentry.customerNote': 'a caller field named like SDK metadata',
        hostname: 'vm',
      },
    });

    expect(scrubbed.attributes).toEqual({
      'sentry.origin': 'auto.log.pino',
      'sentry.environment': 'production',
      'pino.logger.level': 50,
      operation: 'send_confirmation',
      signupId: 'uuid-1',
    });
  });

  it('keeps console-log message parameters, which only the denylist applies to', () => {
    const scrubbed = scrubLog({
      level: 'warn',
      message: 'Retrying in 5s',
      attributes: {
        'sentry.origin': 'auto.log.console',
        'sentry.message.parameter.0': '5s',
      },
    });

    expect(scrubbed.attributes).toEqual({
      'sentry.origin': 'auto.log.console',
      'sentry.message.parameter.0': '5s',
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

describe('parseSentryDsn', () => {
  it('extracts org id, project id and ingest host from a Sentry SaaS DSN', () => {
    expect(parseSentryDsn('https://public@o123456.ingest.us.sentry.io/7891011')).toEqual({
      orgId: '123456',
      projectId: '7891011',
      region: 'us',
      ingestHost: 'o123456.ingest.us.sentry.io',
    });
  });

  it('handles a DSN with no region', () => {
    expect(parseSentryDsn('https://public@o1.ingest.sentry.io/1')).toEqual({
      orgId: '1',
      projectId: '1',
      region: undefined,
      ingestHost: 'o1.ingest.sentry.io',
    });
  });

  it('accepts a region label longer than two letters (R-45)', () => {
    expect(parseSentryDsn('https://public@o1.ingest.us2.sentry.io/1')).toMatchObject({
      region: 'us2',
      ingestHost: 'o1.ingest.us2.sentry.io',
    });
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['the Vercel sensitive placeholder', '[SENSITIVE]'],
    ['not a URL at all', 'not-a-dsn'],
    ['a look-alike ingest host outside sentry.io', 'https://public@o1.ingest.evil.com/1'],
    ['a region label ending in a hyphen', 'https://public@o1.ingest.us-.sentry.io/1'],
    [
      'a self-hosted, non-SaaS host (R-04: treated as unconfigured, not tunnelled to a third party)',
      'https://public@sentry.internal.example/1',
    ],
    ['a non-numeric project id', 'https://public@o1.ingest.sentry.io/not-a-project'],
    ['no project id at all', 'https://public@o1.ingest.sentry.io/'],
  ])('returns undefined for %s', (_label, raw) => {
    expect(parseSentryDsn(raw)).toBeUndefined();
  });
});

describe('describeDsnProblem / warnOnDsnProblem', () => {
  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['a valid Sentry SaaS DSN', 'https://public@o1.ingest.us.sentry.io/1'],
  ])('has nothing to say when the DSN is %s', (_label, raw) => {
    expect(describeDsnProblem(raw)).toBeUndefined();
    const warn = vi.fn();
    warnOnDsnProblem(raw, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when a DSN is set but would silently disable browser reporting (R-30)', () => {
    const warn = vi.fn();
    warnOnDsnProblem('https://public@sentry.internal.example/1', warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('browser error reporting is disabled');
    expect(describeDsnProblem('https://public@sentry.internal.example/1')).toBe(
      warn.mock.calls[0]?.[0],
    );
  });
});

describe('buildTunnelPath', () => {
  it("carries o, p and, when present, r — the same shape the SDK's own tunnelRoute option would have produced", () => {
    expect(
      buildTunnelPath({ orgId: '123456', projectId: '7891011', region: 'us', ingestHost: 'x' }),
    ).toBe('/monitoring?o=123456&p=7891011&r=us');
    expect(buildTunnelPath({ orgId: '1', projectId: '1', ingestHost: 'x' })).toBe(
      '/monitoring?o=1&p=1',
    );
  });
});

describe('buildIngestUrl', () => {
  it('builds the envelope endpoint from the parsed DSN alone', () => {
    expect(
      buildIngestUrl({
        orgId: '123456',
        projectId: '7891011',
        region: 'us',
        ingestHost: 'o123456.ingest.us.sentry.io',
      }),
    ).toBe('https://o123456.ingest.us.sentry.io/api/7891011/envelope/');
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

  it("sets the tunnel to this deployment's own /monitoring path, never the SDK default", () => {
    const options = buildClientSentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn });
    expect(options.tunnel).toBe('/monitoring?o=1&p=1');
  });

  it('is disabled, with no tunnel, when the DSN is not a recognised Sentry SaaS DSN (R-04)', () => {
    const options = buildClientSentryOptions({
      NEXT_PUBLIC_SENTRY_DSN: 'https://public@sentry.internal.example/1',
    });
    expect(options.enabled).toBe(false);
    expect(options.tunnel).toBeUndefined();
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
    beforeSendSpan: <S extends object>(span: S) => S;
    ignoreErrors: ReadonlyArray<string | RegExp>;
  }): void {
    expect(options.beforeSend).toBeTypeOf('function');
    expect(options.beforeSendTransaction).toBeTypeOf('function');
    expect(options.beforeSendLog).toBeTypeOf('function');
    expect(options.beforeSendSpan).toBeTypeOf('function');

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

    // R-03: standalone browser spans (web vitals) never pass through
    // beforeSendTransaction, so they need a hook of their own.
    const sentSpan = options.beforeSendSpan({
      span_id: '1',
      trace_id: '2',
      start_timestamp: 0,
      description: `GET /early-access/manage#${FORBIDDEN.rawToken}`,
      data: { ...FORBIDDEN },
    });
    expect(sentSpan).toMatchObject({ span_id: '1', trace_id: '2' });
    expectClean(sentSpan);

    expect(options.ignoreErrors).toContain('The operation was aborted');
  }

  it('wires beforeSend, beforeSendTransaction, beforeSendLog and beforeSendSpan that actually scrub (server — sentry.edge.config.ts shares this same builder)', () => {
    const options = buildServerSentryOptions({
      NODE_ENV: 'development',
      CI: undefined,
      E2E_NEON_HTTP_ENDPOINT: undefined,
      NEXT_PUBLIC_SENTRY_DSN: dsn,
    });
    expectHooksAreWiredAndScrub(options);
  });

  it('wires beforeSend, beforeSendTransaction, beforeSendLog and beforeSendSpan that actually scrub (client)', () => {
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
      telemetry: false,
      silent: false,
    });
  });

  it("never sets tunnelRoute (R-04: that option installs the build plugin's own unauthenticated rewrite; app/monitoring/route.ts is the tunnel instead)", () => {
    const vercel = buildSentryBuildOptions({
      SENTRY_ORG: 'corpus',
      SENTRY_PROJECT: 'landing',
      SENTRY_AUTH_TOKEN: 'sntrys_real',
      VERCEL_ENV: 'production',
      CI: 'true',
    });
    expect(vercel.tunnelRoute).toBeUndefined();
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
