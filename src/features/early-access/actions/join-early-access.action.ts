'use server';

import { getEarlyAccessBackend } from '../early-access.wiring';
import { runInstrumentedAction } from './instrumented-action';
import { handleJoinEarlyAccess } from './join-early-access.handler';

export type SignupActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'invalid-email'; message: string }
  | { status: 'retry'; message: string }
  | { status: 'closed' };

/** Span, reporting and the retry fallback: see `runInstrumentedAction`. */
export async function joinEarlyAccessAction(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  return runInstrumentedAction<SignupActionState>(
    'joinEarlyAccess',
    'join_early_access',
    { status: 'retry', message: "We couldn't complete that signup. Please try again." },
    (reporter) => handleJoinEarlyAccess(getEarlyAccessBackend(), formData, reporter),
  );
}
