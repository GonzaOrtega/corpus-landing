import { describe, expect, it, vi } from 'vitest';
import type { EarlyAccessLogFields, Logger } from '@/src/core/ports/logger.port';
import { handleMonitoringTunnelRequest } from './monitoring-route.handler';

const DSN = 'https://public@o123456.ingest.us.sentry.io/7891011';
const ENVELOPE = `{"dsn":"${DSN}"}\n{"type":"event"}\n{}`;
const SITE_ORIGIN = 'https://corpus.example';

function tunnelRequest(query: string, init: RequestInit = {}): Request {
  return new Request(`https://corpus.example/monitoring${query}`, {
    method: 'POST',
    body: ENVELOPE,
    ...init,
  });
}

interface LoggedCall {
  level: 'info' | 'warn' | 'error';
  message: string;
  fields: EarlyAccessLogFields;
}

/** Captures every call instead of asserting per-level, so a test can check both that the right level fired and that nothing else did. */
function fakeLogger(): Logger & { calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];
  return {
    calls,
    info: (message, fields) => calls.push({ level: 'info', message, fields }),
    warn: (message, fields) => calls.push({ level: 'warn', message, fields }),
    error: (message, fields) => calls.push({ level: 'error', message, fields }),
  };
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
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(tunnelRequest(query), DSN, forward, {
      logger,
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([
      {
        level: 'warn',
        message: expect.any(String),
        fields: {
          operation: 'monitoring_tunnel',
          status: 'rejected',
          errorCode: 'org_project_mismatch',
        },
      },
    ]);
  });

  it("forwards to this deployment's own ingest host even when the envelope body names a foreign dsn (R-34)", async () => {
    const foreignDsn = 'https://public@o999999.ingest.us.sentry.io/123123';
    const envelopeWithForeignDsn = `{"dsn":"${foreignDsn}"}\n{"type":"event"}\n{}`;
    const forward = vi.fn(
      async (_input: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011', { body: envelopeWithForeignDsn }),
      DSN,
      forward,
    );

    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
    const [url] = forward.mock.calls[0];
    expect(url).toBe('https://o123456.ingest.us.sentry.io/api/7891011/envelope/');
  });

  it('rejects an oversized body declared via Content-Length before reading it, and logs the rejection', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();
    const request = tunnelRequest('?o=123456&p=7891011', {
      headers: { 'content-length': String(10_000_000) },
    });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, { logger });

    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([
      {
        level: 'warn',
        message: expect.any(String),
        fields: {
          operation: 'monitoring_tunnel',
          status: 'rejected',
          errorCode: 'oversized_declared',
        },
      },
    ]);
  });

  const oversizedActual = [
    {
      level: 'warn',
      message: expect.any(String),
      fields: { operation: 'monitoring_tunnel', status: 'rejected', errorCode: 'oversized_actual' },
    },
  ];

  it('rejects an oversized body even when Content-Length understates it', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();
    const request = tunnelRequest('?o=123456&p=7891011', {
      body: 'x'.repeat(300_000),
      headers: { 'content-length': '1000' },
    });
    expect(request.headers.get('content-length')).toBe('1000');

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, { logger });

    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual(oversizedActual);
  });

  /**
   * R-46: a chunked body declares no size, so the Content-Length fast path
   * cannot help. The read must stop at the limit and cancel the stream, not
   * buffer everything the caller sends and measure it afterwards.
   */
  it('stops reading a body that declares no size once it passes the limit, and cancels the rest', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();
    const chunk = new Uint8Array(64_000);
    let pulled = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel,
    });
    const request = tunnelRequest('?o=123456&p=7891011', {
      body,
      duplex: 'half',
    } as RequestInit);
    expect(request.headers.get('content-length')).toBeNull();

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, { logger });

    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulled).toBeLessThan(10);
    expect(logger.calls).toEqual(oversizedActual);
  });

  /**
   * R-05: a caller that aborts or resets mid-POST errors the body stream
   * instead of ending it. That has to come out as a logged rejection — an
   * unhandled rejection here would hand the platform a generic error and
   * write no line at all, which is the one fault this handler promises to
   * make visible (R-29). Cancelling an already-errored stream rejects with
   * that same error, so this also pins that the cleanup cannot escape.
   */
  it('rejects a body whose stream errors mid-read, and logs exactly one line for it', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"dsn":"x"}\n'));
        controller.error(new TypeError('terminated'));
      },
    });
    const request = tunnelRequest('?o=123456&p=7891011', { body, duplex: 'half' } as RequestInit);

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, { logger });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('');
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([
      {
        level: 'warn',
        message: expect.any(String),
        fields: {
          operation: 'monitoring_tunnel',
          status: 'rejected',
          errorCode: 'body_read_failed:TypeError',
        },
      },
    ]);
    // Never the stream error's own message, which can carry upstream detail (spec §24).
    expect(JSON.stringify(logger.calls)).not.toContain('terminated');
  });

  /**
   * R-23: `warn` is the right level here — a visitor closing their tab must
   * not open a Sentry issue — but it is only safe if the line says *what*
   * broke. A client abort and a platform-side read fault land on the same
   * path, and a genuine read regression would silently stop every browser
   * error report from arriving. Without the class both are written down
   * identically, at a level nobody is alerted on.
   */
  it('carries the stream error class into the body-read rejection, so two faults are distinguishable', async () => {
    const rejectionFor = async (error: unknown): Promise<LoggedCall[]> => {
      const logger = fakeLogger();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(error);
        },
      });
      const request = tunnelRequest('?o=123456&p=7891011', { body, duplex: 'half' } as RequestInit);

      const response = await handleMonitoringTunnelRequest(request, DSN, vi.fn(), { logger });

      expect(response.status).toBe(400);
      return logger.calls;
    };

    const aborted = await rejectionFor(new TypeError('terminated'));
    const faulted = await rejectionFor(new RangeError('stream state is invalid'));

    expect(aborted[0]?.fields.errorCode).toBe('body_read_failed:TypeError');
    expect(faulted[0]?.fields.errorCode).toBe('body_read_failed:RangeError');
    expect(faulted[0]?.fields.errorCode).not.toBe(aborted[0]?.fields.errorCode);
    // Still `warn`, and still one line each: the class is the only addition.
    expect(aborted.map((call) => call.level)).toEqual(['warn']);
    expect(faulted.map((call) => call.level)).toEqual(['warn']);
    // The class only — a stream error's message can carry request detail (spec §24).
    const logged = JSON.stringify([...aborted, ...faulted]);
    expect(logged).not.toContain('terminated');
    expect(logged).not.toContain('invalid');
  });

  it('forwards a body sent in several chunks, reassembled in order', async () => {
    const forward = vi.fn(
      async (_input: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    const encoder = new TextEncoder();
    const parts = ['{"dsn":"x"}\n', '{"type":"event"}\n', '{}'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const request = tunnelRequest('?o=123456&p=7891011', { body, duplex: 'half' } as RequestInit);

    const response = await handleMonitoringTunnelRequest(request, DSN, forward);

    expect(response.status).toBe(200);
    const [, options] = forward.mock.calls[0] ?? [];
    expect(new TextDecoder().decode(options?.body as Uint8Array)).toBe(parts.join(''));
  });

  it('forwards an empty body as an empty payload', async () => {
    const forward = vi.fn(
      async (_input: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    const request = tunnelRequest('?o=123456&p=7891011', { body: null });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward);

    expect(response.status).toBe(200);
    const [, options] = forward.mock.calls[0] ?? [];
    expect(options?.body).toBeInstanceOf(Uint8Array);
    expect((options?.body as Uint8Array | undefined)?.byteLength).toBe(0);
  });

  it('does not forward anything when no DSN is configured, and stays silent — an unconfigured deployment is routine, not a fault', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      undefined,
      forward,
      { logger },
    );

    expect(response.status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([]);
  });

  it('does not forward anything when the configured DSN is not a recognised Sentry SaaS DSN, and logs the misconfiguration', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      'https://public@sentry.internal.example/7891011',
      forward,
      { logger },
    );

    expect(response.status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([
      {
        level: 'warn',
        message: expect.any(String),
        fields: {
          operation: 'monitoring_tunnel',
          status: 'rejected',
          errorCode: 'dsn_unparseable',
        },
      },
    ]);
  });

  it('rejects a request whose Origin header names a different site, without forwarding (R-40)', async () => {
    const forward = vi.fn();
    const logger = fakeLogger();
    const request = tunnelRequest('?o=123456&p=7891011', {
      headers: { origin: 'https://attacker.example' },
    });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, {
      logger,
      siteOrigin: SITE_ORIGIN,
    });

    expect(response.status).toBe(403);
    expect(forward).not.toHaveBeenCalled();
    expect(logger.calls).toEqual([
      {
        level: 'warn',
        message: expect.any(String),
        fields: { operation: 'monitoring_tunnel', status: 'rejected', errorCode: 'foreign_origin' },
      },
    ]);
  });

  it('forwards a request whose Origin header matches this deployment', async () => {
    const forward = vi.fn(async () => new Response(null, { status: 200 }));
    const request = tunnelRequest('?o=123456&p=7891011', {
      headers: { origin: SITE_ORIGIN },
    });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward, {
      siteOrigin: SITE_ORIGIN,
    });

    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it('forwards a request with no Origin header at all — the check fails open on absence, not on mismatch', async () => {
    const forward = vi.fn(async () => new Response(null, { status: 200 }));

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
      { siteOrigin: SITE_ORIGIN },
    );

    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("forwards a cross-site Origin when the caller could not supply this deployment's own origin — a best-effort check skips rather than fails closed", async () => {
    const forward = vi.fn(async () => new Response(null, { status: 200 }));
    const request = tunnelRequest('?o=123456&p=7891011', {
      headers: { origin: 'https://attacker.example' },
    });

    const response = await handleMonitoringTunnelRequest(request, DSN, forward);

    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it('logs nothing on a successful forward — the high-volume path stays silent by design', async () => {
    const forward = vi.fn(async () => new Response(null, { status: 200 }));
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
      { logger },
    );

    expect(response.status).toBe(200);
    expect(logger.calls).toEqual([]);
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

  it('turns an upstream network failure into a 502 rather than throwing, and logs the bound error class', async () => {
    const forward = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
      { logger },
    );

    expect(response.status).toBe(502);
    expect(logger.calls).toEqual([
      {
        level: 'error',
        message: 'Monitoring tunnel failed to reach Sentry',
        fields: { operation: 'monitoring_tunnel', status: 'failed', errorCode: 'TypeError' },
      },
    ]);
    // Never the error's own message, which could carry a URL or upstream detail (spec §24).
    expect(JSON.stringify(logger.calls)).not.toContain('fetch failed');
  });

  it('distinguishes a fault while assembling the response to an already-successful forward from a forward failure', async () => {
    const brokenUpstream = {
      status: 200,
      headers: {
        get: () => {
          throw new Error('boom');
        },
      },
    } as unknown as Response;
    const forward = vi.fn(async () => brokenUpstream);
    const logger = fakeLogger();

    const response = await handleMonitoringTunnelRequest(
      tunnelRequest('?o=123456&p=7891011'),
      DSN,
      forward,
      { logger },
    );

    expect(response.status).toBe(502);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(logger.calls).toEqual([
      {
        level: 'error',
        message: 'Monitoring tunnel failed to assemble the forwarded response',
        fields: { operation: 'monitoring_tunnel', status: 'failed', errorCode: 'Error' },
      },
    ]);
    // The distinguishing signal from the forward-failure test above is the message text
    // itself, not errorCode (both throw a plain Error here) — this is what proves the two
    // failure modes are told apart rather than flattened into one 502 log line (R-29).
    expect(logger.calls[0]?.message).not.toBe('Monitoring tunnel failed to reach Sentry');
  });
});
