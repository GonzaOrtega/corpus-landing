/// <reference types="bun-types" />
import { readFile } from 'node:fs/promises';
import { getLaunchOperations } from '../src/composition/ops/launch';

function requiredArgument(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index === -1 ? undefined : Bun.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

async function readReleaseInput(): Promise<unknown> {
  const raw = await readFile(requiredArgument('--release-file'), 'utf8');
  return JSON.parse(raw) as unknown;
}

if (import.meta.main) {
  const operation = Bun.argv[2];
  const input = await readReleaseInput();
  const launch = getLaunchOperations();
  const result =
    operation === 'dry-run'
      ? await launch.dryRun(input)
      : operation === 'production'
        ? await launch.production({
            input,
            dryRunFingerprint: requiredArgument('--dry-run-fingerprint'),
          })
        : (() => {
            throw new Error(
              'Usage: bun scripts/launch-email.ts <dry-run|production> --release-file <path>',
            );
          })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
