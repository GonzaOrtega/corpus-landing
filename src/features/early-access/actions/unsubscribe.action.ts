'use server';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { getErrorReporter, getManagementUseCases } from '../early-access.wiring';
import { handleUnsubscribe, type UnsubscribeActionState } from './management.handlers';

export async function unsubscribeAction(rawToken: string): Promise<UnsubscribeActionState> {
  const reporter = getErrorReporter();
  return Sentry.withServerActionInstrumentation(
    'unsubscribe',
    { headers: await headers(), recordResponse: false },
    async (): Promise<UnsubscribeActionState> => {
      try {
        return await handleUnsubscribe(getManagementUseCases().unsubscribe, rawToken, reporter);
      } catch (error) {
        reporter.captureException(error, { operation: 'unsubscribe', status: 'wiring' });
        return { status: 'retry' };
      }
    },
  );
}
