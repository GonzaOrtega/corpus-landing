import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCases = vi.hoisted(() => ({
  resolve: { execute: vi.fn() },
  unsubscribe: { execute: vi.fn() },
}));

vi.mock('../early-access.wiring', () => ({
  getManagementUseCases: () => useCases,
}));

import { resolveManagementAction } from './resolve-management.action';
import { unsubscribeAction } from './unsubscribe.action';

describe('management Server Actions', () => {
  beforeEach(() => {
    useCases.resolve.execute.mockReset();
    useCases.unsubscribe.execute.mockReset();
  });

  it('resolves a management token through the composed use case', async () => {
    useCases.resolve.execute.mockResolvedValue({
      status: 'active',
      maskedEmail: 'g***@example.com',
    });

    await expect(resolveManagementAction('token')).resolves.toEqual({
      status: 'active',
      maskedEmail: 'g***@example.com',
    });
    expect(useCases.resolve.execute).toHaveBeenCalledWith('token');
  });

  it('unsubscribes only through its explicit action', async () => {
    useCases.unsubscribe.execute.mockResolvedValue({ status: 'unsubscribed' });

    await expect(unsubscribeAction('token')).resolves.toEqual({ status: 'unsubscribed' });
    expect(useCases.unsubscribe.execute).toHaveBeenCalledWith('token');
  });

  it('collapses an internal failure to a generic retry state in both actions', async () => {
    useCases.resolve.execute.mockRejectedValue(new Error('database detail'));
    useCases.unsubscribe.execute.mockRejectedValue(new Error('database detail'));

    await expect(resolveManagementAction('token')).resolves.toEqual({ status: 'retry' });
    await expect(unsubscribeAction('token')).resolves.toEqual({ status: 'retry' });
  });
});
