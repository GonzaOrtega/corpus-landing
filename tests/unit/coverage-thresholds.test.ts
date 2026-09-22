import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

type Metrics = { lines: number; branches: number; functions: number; statements: number };

/**
 * Vitest's global thresholds are an aggregate over every file no glob claims,
 * not a per-directory net: a brand-new `src/<dir>/` with zero tests is diluted
 * by everything else and can ship green. The guard against that is this test,
 * not the catch-all — every top-level source directory must be claimed by its
 * own glob, and every glob must still honour the agreed target for its layer.
 */
function parseGlobThresholds(): Record<string, Metrics> {
  const source = read('vitest.config.ts');
  const block = source.slice(source.indexOf('thresholds: {'));
  const entries = [
    ...block.matchAll(
      /'([^']+)':\s*\{\s*lines:\s*(\d+),\s*branches:\s*(\d+),\s*functions:\s*(\d+),\s*statements:\s*(\d+),?\s*\}/g,
    ),
  ];
  return Object.fromEntries(
    entries.map(([, glob, lines, branches, functions, statements]) => [
      glob,
      {
        lines: Number(lines),
        branches: Number(branches),
        functions: Number(functions),
        statements: Number(statements),
      },
    ]),
  );
}

/** The layer targets Gonza agreed to on 2026-09-20; enforced values may only sit above them. */
const targets: Record<string, number> = {
  'src/core/**': 100,
  'src/adapters/**': 90,
  'src/composition/**': 90,
  'src/config/**': 90,
  'src/ops/**': 90,
  'src/features/**': 80,
  'src/components/**': 80,
  'app/**': 80,
  'proxy.ts': 80,
  '{instrumentation,instrumentation-client,sentry.*.config,next.config}.ts': 80,
};

describe('coverage thresholds', () => {
  const thresholds = parseGlobThresholds();

  it('claims every top-level source directory with its own glob', () => {
    const sourceDirectories = readdirSync(new URL('../../src', import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `src/${entry.name}/**`)
      .sort();

    expect(
      Object.keys(thresholds)
        .filter((glob) => glob.startsWith('src/'))
        .sort(),
    ).toEqual(sourceDirectories);
    expect(thresholds).toHaveProperty(['app/**']);
    expect(thresholds).toHaveProperty(['proxy.ts']);
  });

  it('measures every root-level production module', () => {
    const include = read('vitest.config.ts').match(/include:\s*\[([^\]]+)\]/g) ?? [];
    const coverageInclude = include.find((text) => text.includes('src/**/*.{ts,tsx}')) ?? '';
    for (const file of [
      'instrumentation.ts',
      'instrumentation-client.ts',
      'sentry.server.config.ts',
      'sentry.edge.config.ts',
      'next.config.ts',
    ]) {
      expect(coverageInclude).toContain(`'${file}'`);
    }
  });

  it('never enforces a glob below the agreed target for its layer', () => {
    expect(Object.keys(thresholds).sort()).toEqual(Object.keys(targets).sort());
    for (const [glob, metrics] of Object.entries(thresholds)) {
      for (const [metric, value] of Object.entries(metrics)) {
        expect(value, `${glob} ${metric}`).toBeGreaterThanOrEqual(targets[glob] ?? 0);
      }
    }
  });
});
