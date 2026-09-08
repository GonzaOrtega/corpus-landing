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
  try {
    return await handleJoinEarlyAccess(getEarlyAccessBackend(), formData);
  } catch {
    return { status: 'retry', message: "We couldn't complete that signup. Please try again." };
  }
}
