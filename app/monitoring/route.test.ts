import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const composition = vi.hoisted(() => ({
  provideConfigSecrets: vi.fn(),
}));

vi.mock('@/src/composition/capabilities/config-secrets', () => ({
  provideConfigSecrets: composition.provideConfigSecrets,
}));

const handler = vi.hoisted(() => ({
  handleMonitoringTunnelRequest: vi.fn(async () => new Response(null, { status: 200 })),
}));

// Partial: only the handler call is stubbed. MONITORING_TUNNEL_OPERATION stays
// real, so the suppression line below is asserted against the same constant the
// handler's own lines carry — a rename cannot silently split the two.
vi.mock('./monitoring-route.handler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./monitoring-route.handler')>()),
  handleMonitoringTunnelRequest: handler.handleMonitoringTunnelRequest,
}));

const { POST } = await import('./route');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const request = () => new Request('https://corpus.example/monitoring', { method: 'POST' });

type TunnelCall = [Request, string | undefined, unknown, { logger?: unknown; siteOrigin?: string }];

const firstCall = () =>
  handler.handleMonitoringTunnelRequest.mock.calls[0] as unknown as TunnelCall;

/**
 * `route.ts` is the composition seam, not the tunnel: every rejection and
 * forwarding rule is asserted in monitoring-route.handler.test.ts against plain
 * Request objects. What is only observable here is which dependencies the route
 * hands the handler, and that a configuration failure costs the request its
 * logging rather than taking the tunnel down with it.
 */
describe('POST /monitoring', () => {
  beforeEach(() => {
    handler.handleMonitoringTunnelRequest.mockClear();
    for (const level of Object.values(logger)) level.mockClear();
    composition.provideConfigSecrets.mockReset().mockReturnValue({
      logger,
      serverConfig: { siteUrl: new URL('https://corpus.example') },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** Vitest sets NODE_ENV=test and Actions sets CI; a deployment has neither. */
  function stubDeployment(): void {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CI', undefined);
    vi.stubEnv('E2E_NEON_HTTP_ENDPOINT', undefined);
  }

  it('passes the logger and this deployment own origin to the handler', async () => {
    stubDeployment();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');

    await POST(request());

    expect(handler.handleMonitoringTunnelRequest).toHaveBeenCalledTimes(1);
    const [, dsn, , deps] = firstCall();

    expect(dsn).toBe('https://key@o1.ingest.sentry.io/2');
    expect(deps.logger).toBe(logger);
    expect(deps.siteOrigin).toBe('https://corpus.example');
  });

  it.each([
    ['CI', 'CI', 'true'],
    ['NODE_ENV=test', 'NODE_ENV', 'test'],
    ['E2E_NEON_HTTP_ENDPOINT', 'E2E_NEON_HTTP_ENDPOINT', 'http://proxy:4444/sql'],
  ])(
    'hands the handler no DSN in a pipeline run (%s), so nothing is forwarded (R-27)',
    async (_label, name, value) => {
      stubDeployment();
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');
      vi.stubEnv(name, value);

      await POST(request());

      const [, dsn] = firstCall();
      expect(dsn).toBeUndefined();
    },
  );

  /**
   * R-06: the handler cannot tell "suppressed on purpose" from "this site
   * never configured Sentry" once the DSN has been blanked, and answers 404
   * either way while the browser SDK keeps posting. The line below is the
   * only record that the traffic is being dropped by choice.
   */
  it('writes one line when a pipeline marker suppresses a configured DSN (R-06)', async () => {
    stubDeployment();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');
    vi.stubEnv('CI', 'true');

    await POST(request());

    const [, dsn] = firstCall();
    expect(dsn).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      operation: 'monitoring_tunnel',
      status: 'rejected',
      errorCode: 'pipeline_suppressed',
    });
  });

  // Nothing is being withheld here, so there is nothing to report: this is
  // the routine "Sentry is not set up" case the handler already keeps quiet
  // about, and a line per probe would be noise.
  it('stays quiet in a pipeline run that has no DSN to suppress', async () => {
    stubDeployment();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined);
    vi.stubEnv('CI', 'true');

    await POST(request());

    expect(logger.warn).not.toHaveBeenCalled();
  });

  // A marker that is merely *defined* is not the explicit signal spec §34
  // asks for: an exported-but-empty CI, or a platform spelling a disabled
  // flag out, would otherwise take a real deployment's tunnel down.
  it.each([
    ['an empty value', ''],
    ['the literal false', 'false'],
    ['the literal zero', '0'],
    ['whitespace only', '  '],
  ])('does not suppress on a CI marker carrying %s', async (_label, value) => {
    stubDeployment();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');
    vi.stubEnv('CI', value);

    await POST(request());

    const [, dsn] = firstCall();
    expect(dsn).toBe('https://key@o1.ingest.sentry.io/2');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // The two failures are independent: losing configuration must not turn a
  // suppressed request into an unhandled throw on the way to the handler.
  it('still forwards a suppressed request when there is no logger to report it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    composition.provideConfigSecrets.mockImplementation(() => {
      throw new Error('SITE_URL is not configured');
    });
    stubDeployment();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');
    vi.stubEnv('CI', 'true');

    const response = await POST(request());

    expect(response.status).toBe(200);
    const [, dsn, , deps] = firstCall();
    expect(dsn).toBeUndefined();
    expect(deps).toEqual({});
  });

  it('still forwards when server configuration fails, without logging or an origin', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    composition.provideConfigSecrets.mockImplementation(() => {
      throw new Error('SITE_URL is not configured');
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(handler.handleMonitoringTunnelRequest).toHaveBeenCalledTimes(1);
    const [, , , deps] = firstCall();

    expect(deps).toEqual({});
    expect(consoleError).toHaveBeenCalledWith(
      'Monitoring tunnel: server configuration unavailable; continuing without logging',
    );
  });
});
