/**
 * The only operational metadata early-access logging may ever carry (Task 5
 * plan) — signup UUID, not the signup's email; a lifecycle/delivery state
 * string, not the state's payload. Adapters must enforce this at runtime,
 * not just at the type level, since a caller can always build the object
 * dynamically or cast past the type.
 */
export interface EarlyAccessLogFields {
  signupId?: string;
  operation: string;
  status?: string;
  errorCode?: string;
  attemptCount?: number;
  aggregateCount?: number;
  durationMs?: number;
}

/**
 * The allowlist as data, so every adapter that must enforce it at runtime
 * (Pino, Sentry) reads one definition instead of restating the interface.
 */
export const EARLY_ACCESS_LOG_FIELDS = [
  'signupId',
  'operation',
  'status',
  'errorCode',
  'attemptCount',
  'aggregateCount',
  'durationMs',
] as const satisfies readonly (keyof EarlyAccessLogFields)[];

/**
 * Only string/number survive, even in an allowed key's slot — a caller
 * passing an object where a scalar belongs (e.g. a whole Error as
 * `errorCode`) must not smuggle its nested fields past the boundary.
 */
export function allowlistLogFields(fields: EarlyAccessLogFields): Record<string, string | number> {
  const asRecord = fields as unknown as Record<string, unknown>;
  const safe: Record<string, string | number> = {};
  for (const key of EARLY_ACCESS_LOG_FIELDS) {
    const value = asRecord[key];
    if (typeof value === 'string' || typeof value === 'number') safe[key] = value;
  }
  return safe;
}

export interface Logger {
  info(message: string, fields: EarlyAccessLogFields): void;
  warn(message: string, fields: EarlyAccessLogFields): void;
  error(message: string, fields: EarlyAccessLogFields): void;
}
