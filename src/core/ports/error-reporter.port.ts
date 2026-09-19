import type { EarlyAccessLogFields } from './logger.port';

/**
 * Reports an exception a boundary caught and is about to collapse into a
 * generic public state. Context is the same scalar allowlist the Logger port
 * carries (spec §24: operation names, signup UUIDs, states, counts — never an
 * email, a token, or request data), so an adapter can forward it as tags
 * without inspecting it. Adapters must re-apply the allowlist at runtime for
 * the same reason the Pino adapter does.
 *
 * Fire-and-forget by contract: reporting must never fail the request it
 * describes, so implementations swallow their own errors.
 */
export interface ErrorReporter {
  captureException(error: unknown, fields: EarlyAccessLogFields): void;
}
