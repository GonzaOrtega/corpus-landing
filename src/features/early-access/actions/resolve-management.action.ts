'use server';

import { getManagementUseCases } from '../early-access.wiring';
import { runInstrumentedAction } from './instrumented-action';
import { handleResolveManagement, type ManagementActionState } from './management.handlers';

/** Span, reporting and the retry fallback: see `runInstrumentedAction`. */
export async function resolveManagementAction(rawToken: string): Promise<ManagementActionState> {
  return runInstrumentedAction<ManagementActionState>(
    'resolveManagement',
    'resolve_management',
    { status: 'retry' },
    (reporter) => handleResolveManagement(getManagementUseCases().resolve, rawToken, reporter),
  );
}
