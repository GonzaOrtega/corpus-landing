import { createHash, timingSafeEqual } from 'node:crypto';
import type { MaintenanceResult } from '../../../../src/composition/server/maintenance.wiring';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function authorized(header: string | null, secret: string | null): boolean {
  if (!header || !secret) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export async function handleMaintenanceRequest(
  request: Request,
  cronSecret: string | null,
  run: () => Promise<MaintenanceResult>,
): Promise<Response> {
  if (!authorized(request.headers.get('authorization'), cronSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  return Response.json(await run());
}
