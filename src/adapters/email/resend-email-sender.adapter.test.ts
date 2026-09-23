import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '../../core/ports/email-sender.port';
import type { EarlyAccessLogFields, Logger } from '../../core/ports/logger.port';
import { type ResendEmailClient, ResendEmailSenderAdapter } from './resend-email-sender.adapter';

const message: EmailMessage = {
  kind: 'confirmation',
  to: 'person@example.com',
  managementUrl: 'https://corpus.example/early-access/manage#opaque-token',
  idempotencyKey: 'corpus-confirmation-v1/signup-1/1',
};
const config = {
  from: 'Corpus <hello@send.corpus.example>',
  replyTo: 'reply@example.com',
  postalAddress: 'Corpus · Buenos Aires, Argentina',
};

describe('ResendEmailSenderAdapter', () => {
  it('returns accepted and forwards the idempotency key without provider details', async () => {
    const calls: unknown[][] = [];
    const client: ResendEmailClient = {
      send: async (...args) => {
        calls.push(args);
        return { data: { id: 'provider-id' }, error: null };
      },
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
      'accepted',
    );
    expect(calls[0]?.[0]).toMatchObject({
      from: config.from,
      to: message.to,
      replyTo: config.replyTo,
      subject: "You're on the list for Corpus",
      html: expect.stringContaining(message.managementUrl),
      text: expect.stringContaining(`Manage early access: ${message.managementUrl}`),
    });
    expect(calls[0]?.[1]).toEqual({ idempotencyKey: message.idempotencyKey });
  });

  it.each([
    [429, 'known_retryable_failure'],
    [503, 'known_retryable_failure'],
    [400, 'known_terminal_failure'],
  ] as const)(
    'classifies HTTP %i without leaking the provider body',
    async (statusCode, expected) => {
      const client: ResendEmailClient = {
        send: async () => ({
          data: null,
          error: { name: 'provider_error', message: 'sensitive provider body', statusCode },
        }),
      };

      await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
        expected,
      );
    },
  );

  it('renders the launch template for a launch message', async () => {
    const calls: unknown[][] = [];
    const client: ResendEmailClient = {
      send: async (...args) => {
        calls.push(args);
        return { data: { id: 'provider-id' }, error: null };
      },
    };
    const launch: EmailMessage = {
      kind: 'launch',
      to: 'person@example.com',
      managementUrl: 'https://corpus.example/early-access/manage#opaque-token',
      idempotencyKey: 'corpus-launch-v1/signup-1',
      releaseVersion: '1.0.0',
      releaseSummary: 'Corpus is ready.',
      includedFeatures: ['Living Lexicon'],
      knownLimitations: ['Android only'],
      downloadUrl: new URL('https://play.google.com/store/apps/details?id=app.corpus'),
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(launch)).resolves.toBe(
      'accepted',
    );
    expect(calls[0]?.[0]).toMatchObject({
      subject: 'Corpus is ready to try',
      html: expect.stringContaining('Living Lexicon'),
      text: expect.stringContaining('Android only'),
    });
    expect(calls[0]?.[1]).toEqual({ idempotencyKey: launch.idempotencyKey });
  });

  it('classifies a rejection with no HTTP status as ambiguous', async () => {
    const client: ResendEmailClient = {
      send: async () => ({
        data: null,
        error: { name: 'application_error', message: 'sensitive provider body', statusCode: null },
      }),
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
      'ambiguous',
    );
  });

  it('classifies a thrown request as ambiguous', async () => {
    const client: ResendEmailClient = {
      send: async () => {
        throw new Error('connection ended after write');
      },
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
      'ambiguous',
    );
  });
});

describe('ResendEmailSenderAdapter diagnostics', () => {
  class RecordingLogger implements Logger {
    readonly errors: EarlyAccessLogFields[] = [];
    info(): void {}
    warn(): void {}
    error(_message: string, fields: EarlyAccessLogFields): void {
      this.errors.push(fields);
    }
  }

  it('records the provider status without the recipient or the response body', async () => {
    const logger = new RecordingLogger();
    const client: ResendEmailClient = {
      send: async () => ({
        data: null,
        error: { name: 'validation_error', message: 'sensitive provider body', statusCode: 422 },
      }),
    };

    await new ResendEmailSenderAdapter(client, config, logger).send(message);

    expect(logger.errors).toEqual([
      {
        operation: 'resend_send',
        status: 'known_terminal_failure',
        errorCode: 'PROVIDER_STATUS_422',
      },
    ]);
    const serialized = JSON.stringify(logger.errors);
    expect(serialized).not.toContain(message.to);
    expect(serialized).not.toContain('sensitive provider body');
  });

  it('records a thrown request', async () => {
    const logger = new RecordingLogger();
    const client: ResendEmailClient = {
      send: async () => {
        throw new Error('socket hang up');
      },
    };

    await new ResendEmailSenderAdapter(client, config, logger).send(message);

    expect(logger.errors).toEqual([
      { operation: 'resend_send', status: 'ambiguous', errorCode: 'PROVIDER_EXCEPTION' },
    ]);
  });

  it('records an unknown provider status distinctly', async () => {
    const logger = new RecordingLogger();
    const client: ResendEmailClient = {
      send: async () => ({
        data: null,
        error: { name: 'application_error', message: 'sensitive provider body', statusCode: null },
      }),
    };

    await new ResendEmailSenderAdapter(client, config, logger).send(message);

    expect(logger.errors).toEqual([
      { operation: 'resend_send', status: 'ambiguous', errorCode: 'PROVIDER_STATUS_UNKNOWN' },
    ]);
  });

  it('stays optional so launch operations need no logger', async () => {
    const client: ResendEmailClient = {
      send: async () => ({ data: null, error: { name: 'x', message: 'y', statusCode: 500 } }),
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
      'known_retryable_failure',
    );
  });
});
