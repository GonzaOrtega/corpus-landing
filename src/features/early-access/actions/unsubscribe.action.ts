'use server';

import { getManagementUseCases } from '../early-access.wiring';
import { runInstrumentedAction } from './instrumented-action';
import { handleUnsubscribe, type UnsubscribeActionState } from './management.handlers';

/** Span, reporting and the retry fallback: see `runInstrumentedAction`. */
export async function unsubscribeAction(rawToken: string): Promise<UnsubscribeActionState> {
  return runInstrumentedAction<UnsubscribeActionState>(
    'unsubscribe',
    'unsubscribe',
    { status: 'retry' },
    (reporter) => handleUnsubscribe(getManagementUseCases().unsubscribe, rawToken, reporter),
  );
}
