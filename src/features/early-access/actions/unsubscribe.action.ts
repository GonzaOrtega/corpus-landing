'use server';

import { getManagementUseCases } from '../early-access.wiring';
import { handleUnsubscribe, type UnsubscribeActionState } from './management.handlers';

export async function unsubscribeAction(rawToken: string): Promise<UnsubscribeActionState> {
  return handleUnsubscribe(getManagementUseCases().unsubscribe, rawToken);
}
