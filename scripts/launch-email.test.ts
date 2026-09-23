import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `scripts/launch-email.ts` sat outside the coverage-measured set entirely
 * (R-15): nothing checked that the one-time launch mailing command still
 * parsed its arguments or dispatched to the right operation. `getLaunchOperations`
 * itself is already covered by `src/composition/ops/launch.wiring.test.ts`;
 * this file only needs the dispatch and argument-parsing around it, so the
 * wiring call is stubbed here rather than re-proven.
 */
const dryRun = vi.fn();
const production = vi.fn();
vi.mock('../src/composition/ops/launch.wiring', () => ({
  getLaunchOperations: () => ({ dryRun, production }),
}));

import { readReleaseInput, requiredArgument, runLaunchEmailCommand } from './launch-email';

describe('requiredArgument', () => {
  it('returns the value following the named flag', () => {
    expect(requiredArgument('--release-file', ['dry-run', '--release-file', '/tmp/x.json'])).toBe(
      '/tmp/x.json',
    );
  });

  it('throws when the flag is absent', () => {
    expect(() => requiredArgument('--release-file', ['dry-run'])).toThrow(
      '--release-file is required',
    );
  });

  it('throws when the flag is the last argument', () => {
    expect(() => requiredArgument('--release-file', ['dry-run', '--release-file'])).toThrow(
      '--release-file is required',
    );
  });

  it('throws when the following token is itself a flag, not a value', () => {
    expect(() =>
      requiredArgument('--release-file', ['dry-run', '--release-file', '--dry-run-fingerprint']),
    ).toThrow('--release-file is required');
  });
});

describe('readReleaseInput / runLaunchEmailCommand', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'launch-email-test-'));
    file = join(dir, 'release.json');
    await writeFile(file, JSON.stringify({ releaseVersion: '1.0.0' }), 'utf8');
    dryRun.mockReset();
    production.mockReset();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads and parses the file named by --release-file', async () => {
    await expect(readReleaseInput(['dry-run', '--release-file', file])).resolves.toEqual({
      releaseVersion: '1.0.0',
    });
  });

  it('dispatches "dry-run" to launch.dryRun with the parsed release input', async () => {
    dryRun.mockResolvedValue({ ok: true });

    await expect(
      runLaunchEmailCommand('dry-run', ['dry-run', '--release-file', file]),
    ).resolves.toEqual({ ok: true });
    expect(dryRun).toHaveBeenCalledWith({ releaseVersion: '1.0.0' });
    expect(production).not.toHaveBeenCalled();
  });

  it('dispatches "production" to launch.production with the parsed input and the dry-run fingerprint', async () => {
    production.mockResolvedValue({ sent: 3 });
    const argv = ['production', '--release-file', file, '--dry-run-fingerprint', 'abc123'];

    await expect(runLaunchEmailCommand('production', argv)).resolves.toEqual({ sent: 3 });
    expect(production).toHaveBeenCalledWith({
      input: { releaseVersion: '1.0.0' },
      dryRunFingerprint: 'abc123',
    });
    expect(dryRun).not.toHaveBeenCalled();
  });

  it('rejects "production" missing --dry-run-fingerprint before calling launch.production', async () => {
    const argv = ['production', '--release-file', file];

    await expect(runLaunchEmailCommand('production', argv)).rejects.toThrow(
      '--dry-run-fingerprint is required',
    );
    expect(production).not.toHaveBeenCalled();
  });

  it('rejects an unknown operation with the usage message, without dispatching to either launch operation', async () => {
    const argv = ['nonsense', '--release-file', file];

    await expect(runLaunchEmailCommand('nonsense', argv)).rejects.toThrow(
      'Usage: bun scripts/launch-email.ts <dry-run|production> --release-file <path>',
    );
    expect(dryRun).not.toHaveBeenCalled();
    expect(production).not.toHaveBeenCalled();
  });
});
