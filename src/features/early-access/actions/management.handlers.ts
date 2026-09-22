import type { ErrorReporter } from '../../../core/ports/error-reporter.port';
import type { EarlyAccessManagementState } from '../../../core/use-cases/resolve-early-access-management.use-case';
import type { UnsubscribeEarlyAccessResult } from '../../../core/use-cases/unsubscribe-early-access.use-case';

export type ManagementActionState = EarlyAccessManagementState | { status: 'retry' };
export type UnsubscribeActionState = UnsubscribeEarlyAccessResult | { status: 'retry' };

/**
 * Both handlers collapse every failure to `retry` (§7: a management URL must
 * never learn why it failed). The reporter sees the error first, with the
 * operation name and nothing derived from the token.
 */
export async function handleResolveManagement(
  useCase: { execute(rawToken: string): Promise<EarlyAccessManagementState> },
  rawToken: string,
  reporter: ErrorReporter,
): Promise<ManagementActionState> {
  try {
    return await useCase.execute(rawToken);
  } catch (error) {
    reporter.captureException(error, { operation: 'resolve_management' });
    return { status: 'retry' };
  }
}

export async function handleUnsubscribe(
  useCase: { execute(rawToken: string): Promise<UnsubscribeEarlyAccessResult> },
  rawToken: string,
  reporter: ErrorReporter,
): Promise<UnsubscribeActionState> {
  try {
    return await useCase.execute(rawToken);
  } catch (error) {
    reporter.captureException(error, { operation: 'unsubscribe' });
    return { status: 'retry' };
  }
}
