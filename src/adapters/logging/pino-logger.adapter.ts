import pino from 'pino';
import {
  allowlistLogFields,
  type EarlyAccessLogFields,
  type Logger,
} from '../../core/ports/logger.port';

/**
 * Strips anything outside the port's allowlist at runtime — a caller
 * building `fields` dynamically (a spread, a cast) bypasses the type
 * system, so `allowlistLogFields` is the actual enforcement, not the
 * interface. The same allowlist feeds the Sentry reporter adapter.
 */
export class PinoLoggerAdapter implements Logger {
  private readonly logger: pino.Logger;

  constructor(destination?: NodeJS.WritableStream) {
    this.logger = destination ? pino(destination) : pino();
  }

  info(message: string, fields: EarlyAccessLogFields): void {
    this.logger.info(allowlistLogFields(fields), message);
  }

  warn(message: string, fields: EarlyAccessLogFields): void {
    this.logger.warn(allowlistLogFields(fields), message);
  }

  error(message: string, fields: EarlyAccessLogFields): void {
    this.logger.error(allowlistLogFields(fields), message);
  }
}
