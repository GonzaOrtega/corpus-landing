import { getMaintenanceOperation } from '../../../../src/composition/server/maintenance';
import { handleMaintenanceRequest } from './maintenance-route.handler';

export async function GET(request: Request): Promise<Response> {
  const maintenance = getMaintenanceOperation();
  return handleMaintenanceRequest(request, maintenance.cronSecret, maintenance.execute);
}
