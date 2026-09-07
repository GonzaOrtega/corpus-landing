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

export interface Logger {
  info(message: string, fields: EarlyAccessLogFields): void;
  warn(message: string, fields: EarlyAccessLogFields): void;
  error(message: string, fields: EarlyAccessLogFields): void;
}
