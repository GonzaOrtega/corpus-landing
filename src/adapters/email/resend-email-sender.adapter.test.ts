import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '../../core/ports/email-sender.port';
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
  ] as const)('classifies HTTP %i without leaking the provider body', async (statusCode, expected) => {
    const client: ResendEmailClient = {
      send: async () => ({
        data: null,
        error: { name: 'provider_error', message: 'sensitive provider body', statusCode },
      }),
    };

    await expect(new ResendEmailSenderAdapter(client, config).send(message)).resolves.toBe(
      expected,
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
