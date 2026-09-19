import * as Sentry from '@sentry/nextjs';
import {
  getMaintenanceOperation,
  type MaintenanceResult,
} from '../../../../src/composition/server/maintenance.wiring';
import {
  MAINTENANCE_MONITOR_CONFIG,
  MAINTENANCE_MONITOR_SLUG,
} from '../../../../src/config/maintenance-schedule';
import { handleMaintenanceRequest } from './maintenance-route.handler';

/**
 * Wraps the authorised run — and only the authorised run — in a Sentry cron
 * check-in and a span. An unauthenticated caller is rejected before any of
 * this exists (maintenance.wiring.test.ts). Errors keep propagating so the
 * 500 contract and `onRequestError` capture are unchanged. The explicit
 * flush matters: Turbopack route handlers are not SDK-wrapped, so nothing
 * else drains the check-in before Vercel freezes the function.
 */
export async function monitoredMaintenanceRun(
  run: () => Promise<MaintenanceResult>,
): Promise<MaintenanceResult> {
  try {
    return await Sentry.withMonitor(
      MAINTENANCE_MONITOR_SLUG,
      () => Sentry.startSpan({ name: 'early-access maintenance', op: 'cron' }, run),
      MAINTENANCE_MONITOR_CONFIG,
    );
  } finally {
    await Sentry.flush(2000);
  }
}

export async function GET(request: Request): Promise<Response> {
  const maintenance = getMaintenanceOperation();
  return handleMaintenanceRequest(request, maintenance.cronSecret, () =>
    monitoredMaintenanceRun(maintenance.execute),
  );
}
