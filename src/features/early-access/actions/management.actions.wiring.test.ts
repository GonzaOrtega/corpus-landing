import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingErrorReporterAdapter } from '../../../core/testing/recording-error-reporter.adapter';

const useCases = vi.hoisted(() => ({
  resolve: { execute: vi.fn() },
  unsubscribe: { execute: vi.fn() },
}));

const wiringReporter = new RecordingErrorReporterAdapter();

vi.mock('../early-access.wiring', () => ({
  getManagementUseCases: () => useCases,
  getErrorReporter: () => wiringReporter,
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

// Mirrors join-early-access.action.test.ts: record what each action hands the
// Sentry SDK so a regression that starts recording the response, or that names
// the span after the raw token, turns red here. Both management actions carry
// a token in their only argument, so `recordResponse` staying false is the
// difference between a span and a subscriber's credential on a span.
const sentry = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; options: Record<string, unknown> }>,
}));

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: async (
    name: string,
    options: Record<string, unknown>,
    callback: () => unknown,
  ) => {
    sentry.calls.push({ name, options });
    return callback();
  },
}));

import { resolveManagementAction } from './resolve-management.action';
import { unsubscribeAction } from './unsubscribe.action';

describe('management Server Actions', () => {
  beforeEach(() => {
    useCases.resolve.execute.mockReset();
    useCases.unsubscribe.execute.mockReset();
    sentry.calls.length = 0;
    wiringReporter.reports.length = 0;
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

  it('instruments both actions without recording their responses', async () => {
    useCases.resolve.execute.mockResolvedValue({ status: 'active', maskedEmail: 'g***@x.com' });
    useCases.unsubscribe.execute.mockResolvedValue({ status: 'unsubscribed' });

    await resolveManagementAction('token');
    await unsubscribeAction('token');

    expect(sentry.calls.map((call) => call.name)).toEqual(['resolveManagement', 'unsubscribe']);
    for (const call of sentry.calls) {
      expect(call.options.recordResponse).toBe(false);
      expect(JSON.stringify(call.options)).not.toContain('token');
    }
  });
});
