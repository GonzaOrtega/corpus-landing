import { describe, expect, it, vi } from 'vitest';
import { handleMonitoringTunnelRequest } from './monitoring-route.handler';

const DSN = 'https://public@o123456.ingest.us.sentry.io/7891011';
const ENVELOPE = `{"dsn":"${DSN}"}\n{"type":"event"}\n{}`;

function tunnelRequest(query: string, init: RequestInit = {}): Request {
  return new Request(`https://corpus.example/monitoring${query}`, {
    method: 'POST',
    body: ENVELOPE,
    ...init,
  });
}

describe('handleMonitoringTunnelRequest', () => {
  it("forwards a request whose o/p match this deployment's own DSN to the derived ingest host", async () => {
    const forward = vi.fn(
      async (_input: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
    );

    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
    const [url, options] = forward.mock.calls[0];
    expect(url).toBe('https://o123456.ingest.us.sentry.io/api/7891011/envelope/');
    expect(options?.method).toBe('POST');
    expect(new TextDecoder().decode(options?.body as ArrayBuffer)).toBe(ENVELOPE);
  });

  it.each([
    ['a foreign org id', '?o=999999&p=7891011'],
    ['a foreign project id', '?o=123456&p=000000'],
    ['no query at all', ''],
  ])('rejects %s without forwarding, and without body detail', async (_label, query) => {
    const forward = vi.fn();

    const response = await handleMonitoringTunnelRequest(tunnelRequest(query), DSN, forward);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(forward).not.toHaveBeenCalled();
  });

  it('rejects an oversized body declared via Content-Length before reading it', async () => {
    const forward = vi.fn();
    const request = tunnelRequest('?o=123456&p=7891011', {
      headers: { 'content-length': String(10_000_000) },
    });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward);

    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });

  it('rejects an oversized body even when Content-Length understates it', async () => {
    const forward = vi.fn();
    const request = tunnelRequest('?o=123456&p=7891011', { body: 'x'.repeat(300_000) });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward);

    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });

  it('does not forward anything when no DSN is configured', async () => {
    const forward = vi.fn();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      undefined,
      forward,
    );

    expect(response.status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
  });

  it('does not forward anything when the configured DSN is not a recognised Sentry SaaS DSN', async () => {
    const forward = vi.fn();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      'https://public@sentry.internal.example/7891011',
      forward,
    );

    expect(response.status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
  });

  it('relays only the rate-limit headers from a throttled upstream response', async () => {
    const forward = vi.fn(
      async () =>
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '30', 'x-sentry-rate-limits': '30::key', 'set-cookie': 'x=1' },
        }),
    );

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('x-sentry-rate-limits')).toBe('30::key');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('turns an upstream network failure into a 502 rather than throwing', async () => {
    const forward = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
    );

    expect(response.status).toBe(502);
  });
});
