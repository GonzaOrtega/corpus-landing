import { beforeEach, describe, expect, it, vi } from 'vitest';

const maintenance = vi.hoisted(() => ({
  cronSecret: 'cron-secret-value',
  execute: vi.fn(),
}));

vi.mock('../../../../src/composition/server/maintenance.wiring', () => ({
  getMaintenanceOperation: () => maintenance,
}));

import { GET } from './route';

describe('GET /api/cron/maintenance', () => {
  beforeEach(() => {
    maintenance.execute.mockReset().mockResolvedValue({
      confirmationRetriesProcessed: 2,
      confirmationExhausted: 1,
      unsubscribedAnonymized: 3,
      launchedAnonymized: 0,
    });
  });

  it('runs maintenance and returns its result for the exact bearer secret', async () => {
    const response = await GET(
      new Request('https://corpus.example/api/cron/maintenance', {
        headers: { authorization: 'Bearer cron-secret-value' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      confirmationRetriesProcessed: 2,
      confirmationExhausted: 1,
      unsubscribedAnonymized: 3,
      launchedAnonymized: 0,
    });
    expect(maintenance.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects any other credential without running anything', async () => {
    const response = await GET(
      new Request('https://corpus.example/api/cron/maintenance', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );

    expect(response.status).toBe(401);
    expect(maintenance.execute).not.toHaveBeenCalled();
  });
});
