import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { NEVER_LOG_FIXTURE, NEVER_LOG_FIXTURE_STRINGS } from '../../core/testing/never-log-fixture';
import { PinoLoggerAdapter } from './pino-logger.adapter';

function captureStream() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const lines = () =>
    chunks
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines };
}

describe('PinoLoggerAdapter', () => {
  it('logs allowlisted operational fields', () => {
    const { stream, lines } = captureStream();
    const logger = new PinoLoggerAdapter(stream);

    logger.info('signup created', {
      signupId: 'signup-1',
      operation: 'join',
      status: 'pending',
      attemptCount: 1,
    });

    const [entry] = lines();
    expect(entry?.signupId).toBe('signup-1');
    expect(entry?.operation).toBe('join');
    expect(entry?.status).toBe('pending');
    expect(entry?.attemptCount).toBe(1);
    expect(entry?.msg).toBe('signup created');
  });

  it('drops any field outside the allowlist, even one added by bypassing the type', () => {
    const { stream, lines } = captureStream();
    const logger = new PinoLoggerAdapter(stream);
    // Simulates a caller building fields dynamically (e.g. from a spread) —
    // the adapter must not trust the type system alone to keep PII out. The
    // JSON round-trip stands in for that: the fixture arrives shaped like
    // untyped, dynamically-built data, not a typed `EarlyAccessLogFields`.
    const fields = JSON.parse(JSON.stringify({ operation: 'join', ...NEVER_LOG_FIXTURE }));

    logger.info('signup created', fields);

    const [entry] = lines();
    expect(entry?.operation).toBe('join');
    expect(entry?.email).toBeUndefined();
    expect(entry?.rawToken).toBeUndefined();
    expect(entry?.manageTokenHash).toBeUndefined();
    const serialized = JSON.stringify(entry);
    for (const forbidden of NEVER_LOG_FIXTURE_STRINGS) expect(serialized).not.toContain(forbidden);
  });

  it('drops a non-primitive value even in an allowed field slot, never serializing it', () => {
    const { stream, lines } = captureStream();
    const logger = new PinoLoggerAdapter(stream);
    // A caller bug — passing a whole object where a string/number belongs —
    // must not smuggle nested PII through an otherwise-allowed key.
    const fields = JSON.parse(
      '{"operation":"join","errorCode":{"message":"failed","context":{"email":"person@example.com"}}}',
    );

    logger.info('signup created', fields);

    const [entry] = lines();
    expect(entry?.operation).toBe('join');
    expect(entry?.errorCode).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('person@example.com');
  });

  it('routes error() and warn() to their own levels', () => {
    const { stream, lines } = captureStream();
    const logger = new PinoLoggerAdapter(stream);

    logger.warn('confirmation retry scheduled', { operation: 'confirm', attemptCount: 2 });
    logger.error('launch send failed', { operation: 'launch', errorCode: 'SMTP_TIMEOUT' });

    const [warnEntry, errorEntry] = lines();
    expect(warnEntry?.level).toBe(40);
    expect(errorEntry?.level).toBe(50);
    expect(errorEntry?.errorCode).toBe('SMTP_TIMEOUT');
  });
});
