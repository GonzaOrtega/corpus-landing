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

vi.mock('./monitoring-route.handler', () => ({
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
    composition.provideConfigSecrets.mockReset().mockReturnValue({
      logger,
      serverConfig: { siteUrl: new URL('https://corpus.example') },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('passes the logger and this deployment own origin to the handler', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');

    await POST(request());

    expect(handler.handleMonitoringTunnelRequest).toHaveBeenCalledTimes(1);
    const [, dsn, , deps] = firstCall();

    expect(dsn).toBe('https://key@o1.ingest.sentry.io/2');
    expect(deps.logger).toBe(logger);
    expect(deps.siteOrigin).toBe('https://corpus.example');
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
