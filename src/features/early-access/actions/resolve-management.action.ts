'use server';

import { getManagementUseCases } from '../early-access.wiring';
import { handleResolveManagement, type ManagementActionState } from './management.handlers';

export async function resolveManagementAction(rawToken: string): Promise<ManagementActionState> {
  return handleResolveManagement(getManagementUseCases().resolve, rawToken);
}
