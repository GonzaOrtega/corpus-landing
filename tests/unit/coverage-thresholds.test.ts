import { existsSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

/**
 * R-06: the bare `lines`/`branches`/`functions`/`statements` keys in
 * `vitest.config.ts`'s `coverage.thresholds` look like a catch-all for
 * anything the more specific globs below them don't claim, but Vitest's own
 * threshold resolver does not scope them that way — verified against the
 * installed `@vitest/coverage-v8`'s `resolveThresholds`
 * (node_modules/vitest/dist/chunks/index.*.js): the "global" bucket is built
 * from `coverageMap.files()`, i.e. every measured file, with the comment
 * "Global threshold is for all files, even if they are included by glob
 * patterns" right above it. A brand-new, wholly untested top-level directory
 * (or root file) would be averaged into a global that already sits well
 * above 80% from `src/core/**` and friends, and would not fail the gate.
 *
 * The fix this test makes real: every top-level `src/` directory, and every
 * standalone root file named directly in `coverage.include` (not covered by
 * a `src/**`/`app/**` glob), must have its own threshold entry — and that
 * entry must still sit at or above the agreed target for its layer, so a
 * later ratchet recompute cannot quietly lower a gate instead of raising it.
 *
 * This reads the config as an imported object rather than as parsed text: a
 * net that a formatter reflow could defeat is not a net.
 */

const GLOBAL_THRESHOLD_KEYS = new Set(['lines', 'branches', 'functions', 'statements']);

/**
 * The agreed per-layer targets. Enforced values are `max(target, measured
 * floor)` (docs/quality/testing.md, "Ratchet rule"), so they may sit above a
 * target but never below it. Changing a number here is a deliberate change to
 * what the project promises, not a bookkeeping update.
 */
const AGREED_TARGETS: Record<string, number> = {
  'src/core/**': 100,
  'src/adapters/**': 90,
  'src/composition/**': 90,
  'src/config/**': 90,
  'src/ops/**': 90,
  'src/features/**': 80,
  'src/components/**': 80,
  'app/**': 80,
  'proxy.ts': 80,
  'instrumentation.ts': 80,
  'instrumentation-client.ts': 80,
  'sentry.server.config.ts': 80,
  'sentry.edge.config.ts': 80,
  'next.config.ts': 80,
  'scripts/launch-email.ts': 80,
};

/**
 * Root-level `.ts` files that are build or test tooling rather than code the
 * deployment runs, so they are deliberately outside the measured set. Adding
 * a root file means either measuring it or naming it here — the point of
 * R-18 is that neither can happen by omission.
 */
const NON_PRODUCTION_ROOT_FILES = new Set([
  'drizzle.config.ts', // Drizzle Kit CLI input
  'playwright.config.ts', // E2E runner config
  'vitest.config.ts', // this gate's own config
]);

/**
 * Top-level directories that hold no code the deployment runs. A directory
 * that is not here and not claimed by a threshold glob fails the check below,
 * which is what stops a brand-new `lib/` or `server/` from shipping
 * unmeasured (R-18). `scripts/` is measured per file rather than wholesale —
 * `scripts/launch-email.ts` has its own threshold and the stack-conformance
 * tool is not shipped — so it is named here and pinned by the root-file rule.
 */
const NON_PRODUCTION_DIRECTORIES = new Set([
  '.claude',
  '.github',
  'docker',
  'docs',
  'drizzle',
  'node_modules',
  'coverage',
  'ops',
  'public',
  'scripts',
  'tests',
]);

const repoRoot = new URL('../../', import.meta.url);

const isSourceFile = (name: string) =>
  (name.endsWith('.ts') || name.endsWith('.tsx')) &&
  !name.endsWith('.test.ts') &&
  !name.endsWith('.test.tsx') &&
  !name.endsWith('.spec.ts') &&
  !name.endsWith('.d.ts');

/** Every source file under `relative`, recursively, as repo-relative paths. */
function sourceFilesUnder(relative: string): string[] {
  const absolute = new URL(relative, repoRoot);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return isSourceFile(relative) ? [relative] : [];

  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const child = `${relative.replace(/\/$/, '')}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sourceFilesUnder(`${child}/`));
    else if (isSourceFile(entry.name)) found.push(child);
  }
  return found;
}

/**
 * The enforced values themselves, pinned (R-25). The agreed targets above are
 * a floor, not a ratchet: `src/features/**` is enforced at 90 against a target
 * of 80, so the target check alone would let it slide to 80 with everything
 * still green — which is exactly the silent lowering the ratchet rule forbids
 * and R-13 recorded as a problem.
 *
 * Changing a number here is changing what the project promises. A raise is
 * ordinary and belongs in the PR that earned it; a lowering additionally needs
 * an entry in docs/quality/testing.md ("Threshold history") saying why the
 * code cannot be exercised. Either way it can no longer happen unnoticed.
 */
const ENFORCED: Record<string, [number, number, number, number]> = {
  'src/core/**': [100, 100, 100, 100],
  'src/adapters/**': [100, 92, 100, 99],
  'src/composition/**': [98, 100, 93, 98],
  'src/config/**': [99, 97, 100, 98],
  'src/ops/**': [95, 90, 100, 95],
  'src/features/**': [90, 90, 86, 88],
  'src/components/**': [100, 100, 100, 100],
  'app/**': [93, 94, 80, 93],
  'proxy.ts': [100, 97, 100, 100],
  'instrumentation.ts': [100, 100, 100, 100],
  'instrumentation-client.ts': [100, 100, 100, 100],
  'sentry.server.config.ts': [100, 100, 100, 100],
  'sentry.edge.config.ts': [100, 100, 100, 100],
  'next.config.ts': [100, 100, 100, 100],
  'scripts/launch-email.ts': [86, 93, 100, 88],
};

function coverageConfig(): Record<string, unknown> {
  const coverage = vitestConfig.test?.coverage;
  if (!coverage || typeof coverage !== 'object') {
    throw new Error('vitest.config.ts has no test.coverage to check');
  }
  return coverage as Record<string, unknown>;
}

function specificThresholds(): Record<string, Record<string, number>> {
  const coverage = coverageConfig();
  if (!('thresholds' in coverage)) {
    throw new Error('vitest.config.ts has no test.coverage.thresholds to check');
  }
  const thresholds = coverage.thresholds as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(thresholds).filter(
      ([key]) => !GLOBAL_THRESHOLD_KEYS.has(key) && key !== 'perFile' && key !== 'autoUpdate',
    ),
  ) as Record<string, Record<string, number>>;
}

function specificThresholdGlobs(): Set<string> {
  return new Set(Object.keys(specificThresholds()));
}

function coverageIncludeGlobs(): string[] {
  const coverage = coverageConfig();
  if (!('include' in coverage)) {
    throw new Error('vitest.config.ts has no test.coverage.include to check');
  }
  return coverage.include as string[];
}

describe('coverage threshold globs (R-06)', () => {
  it('gives every top-level src/ directory its own threshold glob, not just the global catch-all', () => {
    const topLevelDirs = readdirSync(new URL('../../src', import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const specificGlobs = specificThresholdGlobs();

    // Fails loudly, naming the missing glob, rather than a generic "some
    // directory is missing" so the fix is obvious from the test output.
    for (const dir of topLevelDirs) {
      expect(
        specificGlobs.has(`src/${dir}/**`),
        `expected a threshold entry for "src/${dir}/**"`,
      ).toBe(true);
    }
  });

  it('gives every standalone root file in coverage.include its own threshold glob', () => {
    // "Standalone" = no wildcard, i.e. a single named file rather than a
    // `src/**`/`app/**` directory glob — those directory globs are what the
    // previous test enumerates by directory instead.
    const standaloneFiles = coverageIncludeGlobs().filter((pattern) => !pattern.includes('*'));
    const specificGlobs = specificThresholdGlobs();

    expect(standaloneFiles.length).toBeGreaterThan(0);
    for (const file of standaloneFiles) {
      expect(specificGlobs.has(file), `expected a threshold entry for "${file}"`).toBe(true);
    }
  });

  it('never enforces a glob below the agreed target for its layer', () => {
    // Both directions: an enforced glob with no agreed target is an
    // unreviewed promise, and an agreed target with no enforced glob is a
    // promise nothing keeps.
    expect(Object.keys(specificThresholds()).sort()).toEqual(Object.keys(AGREED_TARGETS).sort());

    for (const [glob, metrics] of Object.entries(specificThresholds())) {
      for (const [metric, value] of Object.entries(metrics)) {
        expect(value, `${glob} ${metric}`).toBeGreaterThanOrEqual(AGREED_TARGETS[glob]);
      }
    }
  });

  it('measures every root-level file the deployment runs, or names it as tooling', () => {
    // Derived from the filesystem, NOT from coverage.include — reading the
    // list out of the config it is checking is what made the earlier version
    // pass when a root file was simply never added to it (R-18).
    const rootFiles = readdirSync(repoRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSourceFile(entry.name))
      .map((entry) => entry.name)
      .filter((name) => !NON_PRODUCTION_ROOT_FILES.has(name))
      .sort();
    const measured = new Set(coverageIncludeGlobs());

    expect(rootFiles.length).toBeGreaterThan(0);
    for (const file of rootFiles) {
      expect(
        measured.has(file),
        `"${file}" is a root-level production file: add it to coverage.include, or to NON_PRODUCTION_ROOT_FILES if the deployment never runs it`,
      ).toBe(true);
    }
  });

  it('claims every top-level directory that holds code the deployment runs', () => {
    const globs = specificThresholdGlobs();
    const topLevel = readdirSync(repoRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .filter((name) => !NON_PRODUCTION_DIRECTORIES.has(name))
      .sort();

    for (const dir of topLevel) {
      const claimed = [...globs].some((glob) => glob.startsWith(`${dir}/`));
      expect(
        claimed,
        `top-level "${dir}/" contains source files but no threshold glob claims it; add one, or add it to NON_PRODUCTION_DIRECTORIES`,
      ).toBe(true);
    }
  });

  it('never keeps a threshold glob that matches no file on disk', () => {
    // R-23: a glob matching nothing yields an empty coverage map, which
    // reports every metric as fully covered and passes silently. The stale
    // key survives every other check in this file, because they all ask
    // "does each measured file have a rule" and never the reverse.
    for (const glob of specificThresholdGlobs()) {
      const target = glob.endsWith('/**') ? `${glob.slice(0, -2)}` : glob;
      expect(
        sourceFilesUnder(target).length,
        `threshold glob "${glob}" matches no source file: it passes vacuously, so delete it or fix the path`,
      ).toBeGreaterThan(0);
    }
  });

  it('cannot have an enforced value changed without changing this file too', () => {
    const actual = Object.fromEntries(
      Object.entries(specificThresholds()).map(([glob, m]) => [
        glob,
        [m.lines, m.branches, m.functions, m.statements],
      ]),
    );

    // Deep equality both ways: a silent lowering, a silent raise, a dropped
    // glob and an unreviewed new one all fail here.
    expect(actual).toEqual(ENFORCED);
  });
});
