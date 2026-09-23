import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailSender } from '../../core/ports/email-sender.port';
import { FakeEmailSenderAdapter } from './fake-email-sender.adapter';

const sender: EmailSender = new FakeEmailSenderAdapter();

describe('FakeEmailSenderAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a confirmation message without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      sender.send({
        kind: 'confirmation',
        to: 'person@example.com',
        managementUrl: 'https://corpus.example/early-access/manage#token',
        idempotencyKey: 'corpus-confirmation-v1/id/1',
      }),
    ).resolves.toBe('accepted');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a launch message too, so pipeline runs never wait on a provider', async () => {
    await expect(
      sender.send({
        kind: 'launch',
        to: 'person@example.com',
        managementUrl: 'https://corpus.example/early-access/manage#token',
        idempotencyKey: 'corpus-launch-v1/id',
        releaseVersion: '1.0.0',
        releaseSummary: 'First build.',
        includedFeatures: ['Capture'],
        knownLimitations: ['Android only'],
        downloadUrl: new URL('https://downloads.corpus.example/v1'),
      }),
    ).resolves.toBe('accepted');
  });
});
