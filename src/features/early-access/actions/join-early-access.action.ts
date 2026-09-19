'use server';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { getEarlyAccessBackend, getErrorReporter } from '../early-access.wiring';
import { handleJoinEarlyAccess } from './join-early-access.handler';

export type SignupActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'invalid-email'; message: string }
  | { status: 'retry'; message: string }
  | { status: 'closed' };

/**
 * Turbopack builds carry no automatic Server Action instrumentation, so the
 * span is opened here. Only the request headers are handed over (for trace
 * continuation) — never `formData`, which holds the address and CAPTCHA
 * token, and never the response (§24).
 */
export async function joinEarlyAccessAction(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const reporter = getErrorReporter();
  return Sentry.withServerActionInstrumentation(
    'joinEarlyAccess',
    { headers: await headers(), recordResponse: false },
    async (): Promise<SignupActionState> => {
      try {
        return await handleJoinEarlyAccess(getEarlyAccessBackend(), formData, reporter);
      } catch (error) {
        reporter.captureException(error, { operation: 'join_early_access', status: 'wiring' });
        return { status: 'retry', message: "We couldn't complete that signup. Please try again." };
      }
    },
  );
}
