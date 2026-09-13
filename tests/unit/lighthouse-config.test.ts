import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { Config, Flags } from 'lighthouse';
import { initializeConfig } from 'lighthouse/core/config/config.js';
import { ReportScoring } from 'lighthouse/core/scoring.js';
import { describe, expect, it } from 'vitest';

const { safeLoad } = createRequire(import.meta.url)('js-yaml') as {
  safeLoad: (source: string) => unknown;
};

interface LighthouseCIConfig {
  ci: {
    collect: { settings: Flags; url: string[]; startServerCommand?: string };
    assert: { assertions: Record<string, [string, { minScore: number }]> };
  };
}

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface PreviewWorkflow {
  jobs: Record<string, { steps: WorkflowStep[] }>;
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
  it('warms the verified Preview twice before measuring it', () => {
    const workflow = safeLoad(
      readFileSync(new URL('../../.github/workflows/preview.yml', import.meta.url), 'utf8'),
    ) as PreviewWorkflow;
    const steps = workflow.jobs.lighthouse.steps;
    const urlCheckIndex = steps.findIndex((step) => step.name === 'Verify Preview URL');
    const warmIndex = steps.findIndex((step) => step.name === 'Warm Preview deployment');
    const lighthouseIndex = steps.findIndex(
      (step) => step.name === 'Run Lighthouse CI against Preview',
    );

    expect(warmIndex).toBe(urlCheckIndex + 1);
    expect(lighthouseIndex).toBe(warmIndex + 1);
    expect(steps[warmIndex].env).toEqual({
      LHCI_URL: `\${{ needs.preview.outputs.url }}`,
      VERCEL_AUTOMATION_BYPASS_SECRET: `\${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}`,
    });
    expect(steps[warmIndex].run).toContain('for request in 1 2');
    expect(steps[warmIndex].run).toContain('curl --fail');
    expect(steps[warmIndex].run).toContain('x-vercel-protection-bypass');
    expect(steps[warmIndex].run).toContain('x-vercel-set-bypass-cookie');
    expect(steps[warmIndex].run).toContain('"$LHCI_URL"');
  });

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
