'use server';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { getErrorReporter, getManagementUseCases } from '../early-access.wiring';
import { handleResolveManagement, type ManagementActionState } from './management.handlers';

export async function resolveManagementAction(rawToken: string): Promise<ManagementActionState> {
  const reporter = getErrorReporter();
  return Sentry.withServerActionInstrumentation(
    'resolveManagement',
    { headers: await headers(), recordResponse: false },
    async (): Promise<ManagementActionState> => {
      try {
        return await handleResolveManagement(getManagementUseCases().resolve, rawToken, reporter);
      } catch (error) {
        reporter.captureException(error, { operation: 'resolve_management', status: 'wiring' });
        return { status: 'retry' };
      }
    },
  );
}
