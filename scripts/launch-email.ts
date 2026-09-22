/// <reference types="bun-types" />
import { readFile } from 'node:fs/promises';
import { getLaunchOperations } from '../src/composition/ops/launch.wiring';

/**
 * `argv` defaults to `Bun.argv` for the real CLI invocation, and is
 * overridable so the tests below can drive every branch without spawning a
 * subprocess or touching a real argument vector (R-15: this file previously
 * sat outside the coverage-measured set, and `Bun.argv` read directly would
 * have kept it untestable in-process even once included).
 */
export function requiredArgument(name: string, argv: readonly string[] = Bun.argv): string {
  const index = argv.indexOf(name);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

export async function readReleaseInput(argv: readonly string[] = Bun.argv): Promise<unknown> {
  const raw = await readFile(requiredArgument('--release-file', argv), 'utf8');
  return JSON.parse(raw) as unknown;
}

/**
 * The dispatch this script exists for, separated from `import.meta.main` so
 * it can be exercised directly: `import.meta.main` is only ever true for
 * the process's actual entry module, never for a module reached through an
 * `import()` from a test.
 */
export async function runLaunchEmailCommand(
  operation: string | undefined,
  argv: readonly string[] = Bun.argv,
): Promise<unknown> {
  const input = await readReleaseInput(argv);
  const launch = getLaunchOperations();
  if (operation === 'dry-run') return launch.dryRun(input);
  if (operation === 'production') {
    return launch.production({
      input,
      dryRunFingerprint: requiredArgument('--dry-run-fingerprint', argv),
    });
  }
  throw new Error('Usage: bun scripts/launch-email.ts <dry-run|production> --release-file <path>');
}

if (import.meta.main) {
  const result = await runLaunchEmailCommand(Bun.argv[2]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
