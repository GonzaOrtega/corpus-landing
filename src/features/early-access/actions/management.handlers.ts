import type { EarlyAccessManagementState } from '../../../core/use-cases/resolve-early-access-management.use-case';
import type { UnsubscribeEarlyAccessResult } from '../../../core/use-cases/unsubscribe-early-access.use-case';

export type ManagementActionState = EarlyAccessManagementState | { status: 'retry' };
export type UnsubscribeActionState = UnsubscribeEarlyAccessResult | { status: 'retry' };

export async function handleResolveManagement(
  useCase: { execute(rawToken: string): Promise<EarlyAccessManagementState> },
  rawToken: string,
): Promise<ManagementActionState> {
  try {
    return await useCase.execute(rawToken);
  } catch {
    return { status: 'retry' };
  }
}

export async function handleUnsubscribe(
  useCase: { execute(rawToken: string): Promise<UnsubscribeEarlyAccessResult> },
  rawToken: string,
): Promise<UnsubscribeActionState> {
  try {
    return await useCase.execute(rawToken);
  } catch {
    return { status: 'retry' };
  }
}
