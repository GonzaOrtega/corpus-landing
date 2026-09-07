import pino from 'pino';
import type { EarlyAccessLogFields, Logger } from '../../core/ports/logger.port';

const ALLOWED_FIELDS = [
  'signupId',
  'operation',
  'status',
  'errorCode',
  'attemptCount',
  'aggregateCount',
  'durationMs',
] as const satisfies readonly (keyof EarlyAccessLogFields)[];

/**
 * Strips anything outside the port's allowlist at runtime — a caller
 * building `fields` dynamically (a spread, a cast) bypasses the type
 * system, so this is the actual enforcement, not the interface.
 */
/**
 * Only string/number survive, even in an allowed key's slot — a caller
 * passing an object where a scalar belongs (e.g. a whole Error as
 * `errorCode`) must not smuggle its nested fields into the log line.
 */
function toSafeValue(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function allowlist(fields: EarlyAccessLogFields): Record<string, unknown> {
  const asRecord = fields as unknown as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    const value = toSafeValue(asRecord[key]);
    if (value !== undefined) safe[key] = value;
  }
  return safe;
}

export class PinoLoggerAdapter implements Logger {
  private readonly logger: pino.Logger;

  constructor(destination?: NodeJS.WritableStream) {
    this.logger = destination ? pino(destination) : pino();
  }

  info(message: string, fields: EarlyAccessLogFields): void {
    this.logger.info(allowlist(fields), message);
  }

  warn(message: string, fields: EarlyAccessLogFields): void {
    this.logger.warn(allowlist(fields), message);
  }

  error(message: string, fields: EarlyAccessLogFields): void {
    this.logger.error(allowlist(fields), message);
  }
}
