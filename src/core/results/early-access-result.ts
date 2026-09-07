import type { EarlyAccessSignup } from '../entities/early-access-signup';

/**
 * Internal join outcome — §6.1/§6.2/§6.4 name exactly these three lifecycle
 * branches. Never crosses a public boundary: the caller-facing response must
 * not reveal whether a row was new, duplicate, or resubscribed.
 */
export type EarlyAccessJoinOutcome = 'created' | 'duplicate-active' | 'resubscribed';

export interface EarlyAccessJoinResult {
  outcome: EarlyAccessJoinOutcome;
  signup: EarlyAccessSignup;
}
