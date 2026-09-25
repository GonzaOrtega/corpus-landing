/**
 * The Vercel Cron schedule for `/api/cron/maintenance` (spec §10.3), mirrored
 * here so the Sentry cron monitor is upserted with the same expectation the
 * platform actually runs. `app/api/cron/maintenance/route.test.ts` ('upserts
 * the Sentry monitor with the schedule Vercel actually runs') asserts this
 * matches `vercel.json`; change both or neither.
 */
export const MAINTENANCE_CRON_SCHEDULE = '0 5 * * *';

/** Sentry monitor slug — stable, since renaming it orphans the monitor's history. */
export const MAINTENANCE_MONITOR_SLUG = 'early-access-maintenance';

/**
 * Vercel Cron triggers are best-effort to the minute; ten minutes of margin
 * avoids a "missed" alert for platform jitter. A run holds one batch of 100
 * retries plus an anonymization sweep, so fifteen minutes in progress is a
 * hang, not a slow run.
 */
export const MAINTENANCE_MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: MAINTENANCE_CRON_SCHEDULE },
  checkinMargin: 10,
  maxRuntime: 15,
  timezone: 'UTC',
} as const;
