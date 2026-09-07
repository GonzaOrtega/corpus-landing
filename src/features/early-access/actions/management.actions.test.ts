import { describe, expect, it, vi } from 'vitest';
import type { EarlyAccessManagementState } from '../../../core/use-cases/resolve-early-access-management.use-case';
import { handleResolveManagement, handleUnsubscribe } from './management.handlers';

describe('management action mapping', () => {
  it('returns active and already-unsubscribed states without changing their public shape', async () => {
    const active: EarlyAccessManagementState = {
      status: 'active',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => active) }, 'token'),
    ).resolves.toEqual(active);

    const unsubscribed: EarlyAccessManagementState = {
      status: 'unsubscribed',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => unsubscribed) }, 'token'),
    ).resolves.toEqual(unsubscribed);
  });

  it('collapses invalid and internal resolve failures to non-sensitive public states', async () => {
    await expect(
      handleResolveManagement(
        { execute: vi.fn(async () => ({ status: 'invalid' as const })) },
        'bad',
      ),
    ).resolves.toEqual({ status: 'invalid' });
    await expect(
      handleResolveManagement(
        {
          execute: vi.fn(async () => {
            throw new Error('database body with sensitive details');
          }),
        },
        'token',
      ),
    ).resolves.toEqual({ status: 'retry' });
  });

  it('only invokes unsubscribe through its explicit action and maps failures generically', async () => {
    const execute = vi.fn(async () => ({ status: 'unsubscribed' as const }));
    await expect(handleUnsubscribe({ execute }, 'token')).resolves.toEqual({
      status: 'unsubscribed',
    });
    expect(execute).toHaveBeenCalledWith('token');

    await expect(
      handleUnsubscribe(
        {
          execute: vi.fn(async () => {
            throw new Error('private failure');
          }),
        },
        'token',
      ),
    ).resolves.toEqual({ status: 'retry' });
  });
});
