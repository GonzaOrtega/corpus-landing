'use server';

import { getEarlyAccessBackend } from '../early-access.wiring';
import { handleJoinEarlyAccess } from './join-early-access.handler';

export type SignupActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'invalid-email'; message: string }
  | { status: 'retry'; message: string }
  | { status: 'closed' };

export async function joinEarlyAccessAction(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  return handleJoinEarlyAccess(getEarlyAccessBackend(), formData);
}
