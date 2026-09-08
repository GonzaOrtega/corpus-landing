import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { Config, Flags } from 'lighthouse';
import { initializeConfig } from 'lighthouse/core/config/config.js';
import { ReportScoring } from 'lighthouse/core/scoring.js';
import { describe, expect, it } from 'vitest';

interface LighthouseCIConfig {
  ci: {
    collect: { settings: Flags; url: string[]; startServerCommand?: string };
    assert: { assertions: Record<string, [string, { minScore: number }]> };
  };
}

function loadConfig(env: Record<string, string | undefined> = {}): LighthouseCIConfig {
  const module = { exports: {} };
  runInNewContext(readFileSync(new URL('../../lighthouserc.cjs', import.meta.url), 'utf8'), {
    module,
    process: { env },
  });
  return module.exports as LighthouseCIConfig;
}

describe('Lighthouse deployment policy', () => {
  it.each([
    {},
    { LHCI_URL: 'https://corpus.example' },
    { LHCI_DEPLOYMENT_ENV: 'production', LHCI_URL: 'https://corpus.example' },
    { LHCI_DEPLOYMENT_ENV: 'development' },
    { LHCI_DEPLOYMENT_ENV: 'Preview' },
  ])('retains indexing checks without an explicit Preview scope (%j)', (env) => {
    expect(loadConfig(env).ci.collect.settings.skipAudits).toBeUndefined();
  });

  it('excludes only crawlability on Preview and preserves every category threshold', async () => {
    const baseline = loadConfig().ci;
    const preview = loadConfig({
      LHCI_DEPLOYMENT_ENV: 'preview',
      LHCI_URL: 'https://corpus-preview.vercel.app',
    }).ci;
    expect(preview.collect.url).toEqual(['https://corpus-preview.vercel.app']);
    expect(preview.collect.startServerCommand).toBeUndefined();
    expect(preview.collect.settings.skipAudits).toEqual(['is-crawlable']);
    expect(preview.assert.assertions).toEqual(baseline.assert.assertions);
    expect(preview.assert.assertions).toEqual({
      'categories:performance': ['error', { minScore: 0.9 }],
      'categories:accessibility': ['error', { minScore: 0.95 }],
      'categories:best-practices': ['error', { minScore: 0.95 }],
      'categories:seo': ['error', { minScore: 0.95 }],
    });

    // Resolve the installed Lighthouse config with the flags that LHCI forwards.
    const [standard, scoped] = await Promise.all([
      initializeConfig('navigation', undefined, baseline.collect.settings),
      initializeConfig('navigation', undefined, preview.collect.settings),
    ]);
    // Internal Lighthouse signatures reference its private global LH namespace.
    const standardConfig = standard.resolvedConfig as Config.ResolvedConfig;
    const previewConfig = scoped.resolvedConfig as Config.ResolvedConfig;
    const standardCategories = standardConfig.categories!;
    const previewCategories = previewConfig.categories!;
    expect(standardCategories.seo.auditRefs.map(({ id }) => id)).toContain('is-crawlable');
    expect(previewConfig.audits?.map(({ implementation }) => implementation.meta.id)).toEqual(
      standardConfig.audits
        ?.map(({ implementation }) => implementation.meta.id)
        .filter((id) => id !== 'is-crawlable'),
    );
    for (const [category, config] of Object.entries(standardCategories)) {
      expect(previewCategories[category].auditRefs).toEqual(
        config.auditRefs.filter(({ id }) => id !== 'is-crawlable'),
      );
    }

    const scoreWithNoindex = (refs: { id: string; weight: number }[]) =>
      ReportScoring.arithmeticMean(
        refs.map(({ id, weight }) => ({
          weight,
          score: id === 'is-crawlable' ? 0 : 1,
        })),
      );
    expect(scoreWithNoindex(standardCategories.seo.auditRefs)).toBeLessThan(0.95);
    expect(scoreWithNoindex(previewCategories.seo.auditRefs)).toBe(1);
  });
});
