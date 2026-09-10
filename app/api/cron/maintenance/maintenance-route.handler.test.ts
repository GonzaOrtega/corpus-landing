import { describe, expect, it, vi } from 'vitest';
import { handleMaintenanceRequest } from './maintenance-route.handler';

const aggregateResult = {
  confirmationRetriesProcessed: 2,
  confirmationExhausted: 1,
  unsubscribedAnonymized: 3,
  launchedAnonymized: 4,
};

describe('maintenance cron authorization', () => {
  it.each([null, '', 'Bearer wrong', 'Basic secret'])(
    'rejects authorization %j',
    async (header) => {
      const run = vi.fn(async () => aggregateResult);
      const request = new Request('https://corpus.example/api/cron/maintenance', {
        headers: header === null ? undefined : { authorization: header },
      });

      const response = await handleMaintenanceRequest(request, 'correct-secret', run);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('returns aggregate counts only for the exact bearer secret', async () => {
    const run = vi.fn(async () => aggregateResult);
    const request = new Request('https://corpus.example/api/cron/maintenance', {
      headers: { authorization: 'Bearer correct-secret' },
    });

    const response = await handleMaintenanceRequest(request, 'correct-secret', run);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aggregateResult);
    expect(JSON.stringify(await run.mock.results[0]?.value)).not.toContain('@example.com');
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    const run = vi.fn(async () => aggregateResult);
    const response = await handleMaintenanceRequest(
      new Request('https://corpus.example/api/cron/maintenance'),
      null,
      run,
    );

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
});
