import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
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

const { monitoredMaintenanceRun } = await import('./route');

const result = {
  confirmationRetriesProcessed: 1,
  confirmationExhausted: 0,
  unsubscribedAnonymized: 0,
  launchedAnonymized: 0,
};

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
    sentry.monitors.length = 0;
    sentry.spans.length = 0;
    sentry.flush.mockClear();

    await expect(monitoredMaintenanceRun(async () => result)).resolves.toEqual(result);

    expect(sentry.monitors).toEqual([
      { slug: MAINTENANCE_MONITOR_SLUG, config: MAINTENANCE_MONITOR_CONFIG },
    ]);
    expect(sentry.spans).toEqual([{ name: 'early-access maintenance', op: 'cron' }]);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it('keeps propagating failures (the 500 contract) and still flushes', async () => {
    sentry.flush.mockClear();

    await expect(
      monitoredMaintenanceRun(async () => {
        throw new Error('DATABASE_URL is not configured');
      }),
    ).rejects.toThrow('DATABASE_URL is not configured');

    expect(sentry.flush).toHaveBeenCalledTimes(1);
  });
});
