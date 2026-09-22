import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAINTENANCE_CRON_SCHEDULE,
  MAINTENANCE_MONITOR_CONFIG,
  MAINTENANCE_MONITOR_SLUG,
} from '../../../../src/config/maintenance-schedule';

vi.mock('server-only', () => ({}));

const sentry = vi.hoisted(() => ({
  flush: vi.fn(async () => true),
  monitors: [] as Array<{ slug: string; config: unknown }>,
  spans: [] as Array<{ name: string; op?: string }>,
}));

vi.mock('@sentry/nextjs', () => ({
  withMonitor: <T>(slug: string, callback: () => T, config: unknown): T => {
    sentry.monitors.push({ slug, config });
    return callback();
  },
  startSpan: <T>(options: { name: string; op?: string }, callback: () => T): T => {
    sentry.spans.push(options);
    return callback();
  },
  flush: sentry.flush,
}));

const maintenance = vi.hoisted(() => ({
  cronSecret: 'cron-secret-value',
  execute: vi.fn(),
}));

vi.mock('../../../../src/composition/server/maintenance.wiring', () => ({
  getMaintenanceOperation: () => maintenance,
}));

const { GET, monitoredMaintenanceRun } = await import('./route');

const result = {
  confirmationRetriesProcessed: 1,
  confirmationExhausted: 0,
  unsubscribedAnonymized: 0,
  launchedAnonymized: 0,
};

beforeEach(() => {
  sentry.monitors.length = 0;
  sentry.spans.length = 0;
  sentry.flush.mockClear();
});

describe('maintenance cron monitor', () => {
  it('upserts the Sentry monitor with the schedule Vercel actually runs', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(vercel.crons).toEqual([
      { path: '/api/cron/maintenance', schedule: MAINTENANCE_CRON_SCHEDULE },
    ]);
    expect(MAINTENANCE_MONITOR_CONFIG.schedule).toEqual({
      type: 'crontab',
      value: MAINTENANCE_CRON_SCHEDULE,
    });
  });

  it('runs inside a check-in and a cron span, then flushes before the function freezes', async () => {
    await expect(monitoredMaintenanceRun(async () => result)).resolves.toEqual(result);

    expect(sentry.monitors).toEqual([
      { slug: MAINTENANCE_MONITOR_SLUG, config: MAINTENANCE_MONITOR_CONFIG },
    ]);
    expect(sentry.spans).toEqual([{ name: 'early-access maintenance', op: 'cron' }]);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it('keeps propagating failures (the 500 contract) and still flushes', async () => {
    await expect(
      monitoredMaintenanceRun(async () => {
        throw new Error('DATABASE_URL is not configured');
      }),
    ).rejects.toThrow('DATABASE_URL is not configured');

    expect(sentry.flush).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/maintenance', () => {
  beforeEach(() => {
    maintenance.execute.mockReset().mockResolvedValue({
      confirmationRetriesProcessed: 2,
      confirmationExhausted: 1,
      unsubscribedAnonymized: 3,
      launchedAnonymized: 0,
    });
  });

  it('runs maintenance and returns its result for the exact bearer secret', async () => {
    const response = await GET(
      new Request('https://corpus.example/api/cron/maintenance', {
        headers: { authorization: 'Bearer cron-secret-value' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      confirmationRetriesProcessed: 2,
      confirmationExhausted: 1,
      unsubscribedAnonymized: 3,
      launchedAnonymized: 0,
    });
    expect(maintenance.execute).toHaveBeenCalledTimes(1);
  });

  it('wraps the authorised run in the same check-in the monitor test asserts', async () => {
    await GET(
      new Request('https://corpus.example/api/cron/maintenance', {
        headers: { authorization: 'Bearer cron-secret-value' },
      }),
    );

    expect(sentry.monitors).toEqual([
      { slug: MAINTENANCE_MONITOR_SLUG, config: MAINTENANCE_MONITOR_CONFIG },
    ]);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it('rejects any other credential without running anything', async () => {
    const response = await GET(
      new Request('https://corpus.example/api/cron/maintenance', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );

    expect(response.status).toBe(401);
    expect(maintenance.execute).not.toHaveBeenCalled();
    expect(sentry.monitors).toEqual([]);
  });
});
