import { readdirSync } from 'node:fs';
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
});
