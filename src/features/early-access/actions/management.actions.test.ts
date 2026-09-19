import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingErrorReporterAdapter } from '../../../core/testing/recording-error-reporter.adapter';
import type { EarlyAccessManagementState } from '../../../core/use-cases/resolve-early-access-management.use-case';
import { handleResolveManagement, handleUnsubscribe } from './management.handlers';

let reporter: RecordingErrorReporterAdapter;

describe('management action mapping', () => {
  beforeEach(() => {
    reporter = new RecordingErrorReporterAdapter();
  });

  it('returns active and already-unsubscribed states without changing their public shape', async () => {
    const active: EarlyAccessManagementState = {
      status: 'active',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => active) }, 'token', reporter),
    ).resolves.toEqual(active);

    const unsubscribed: EarlyAccessManagementState = {
      status: 'unsubscribed',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => unsubscribed) }, 'token', reporter),
    ).resolves.toEqual(unsubscribed);
  });

  it('collapses invalid and internal resolve failures to non-sensitive public states', async () => {
    await expect(
      handleResolveManagement(
        { execute: vi.fn(async () => ({ status: 'invalid' as const })) },
        'bad',
        reporter,
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
        reporter,
      ),
    ).resolves.toEqual({ status: 'retry' });
    expect(reporter.reports).toEqual([
      {
        error: expect.objectContaining({ message: 'database body with sensitive details' }),
        fields: { operation: 'resolve_management' },
      },
    ]);
    expect(JSON.stringify(reporter.reports[0]?.fields)).not.toContain('token');
  });

  it('only invokes unsubscribe through its explicit action and maps failures generically', async () => {
    const execute = vi.fn(async () => ({ status: 'unsubscribed' as const }));
    await expect(handleUnsubscribe({ execute }, 'token', reporter)).resolves.toEqual({
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
        reporter,
      ),
    ).resolves.toEqual({ status: 'retry' });
    expect(reporter.reports.map((report) => report.fields)).toEqual([{ operation: 'unsubscribe' }]);
  });
});
