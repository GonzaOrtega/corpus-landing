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
 * a `src/**`/`app/**` glob), must have its own threshold entry. This test
 * fails the moment a new one ships without one — restoring the protection
 * the catch-all's comment claims but the runner does not actually provide.
 */

const GLOBAL_THRESHOLD_KEYS = new Set(['lines', 'branches', 'functions', 'statements']);

function specificThresholdGlobs(): Set<string> {
  const coverage = vitestConfig.test?.coverage;
  if (!coverage || typeof coverage !== 'object' || !('thresholds' in coverage)) {
    throw new Error('vitest.config.ts has no test.coverage.thresholds to check');
  }
  const thresholds = coverage.thresholds as Record<string, unknown>;
  return new Set(
    Object.keys(thresholds).filter(
      (key) => !GLOBAL_THRESHOLD_KEYS.has(key) && key !== 'perFile' && key !== 'autoUpdate',
    ),
  );
}

function coverageIncludeGlobs(): string[] {
  const coverage = vitestConfig.test?.coverage;
  if (!coverage || typeof coverage !== 'object' || !('include' in coverage)) {
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
});
