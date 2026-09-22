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
    expect(steps[warmIndex].run).not.toContain('x-vercel-set-bypass-cookie');
    expect(steps[warmIndex].run).not.toContain('--location');
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

  // The blanking lives inside `if (!previewUrl)`, executed for its
  // side effect on `process.env` before the LHCI config is even built.
  // A text search over the file (as tests/unit/e2e-runtime-config.test.ts
  // does for the other two runtimes) cannot tell a live guard from one
  // that has been inverted or neutered — the literal strings survive
  // either way. `loadConfig` runs this file in a VM with our own `env`
  // object standing in for `process.env`; because `Object.assign(process.env, …)`
  // mutates that same object in place, we can assert on `env` itself after
  // the call to prove the guard actually ran, not just that the words exist.
  it('blanks the Sentry DSN/auth token and forces CI=true for the local server it starts', () => {
    const env: Record<string, string | undefined> = {
      NEXT_PUBLIC_SENTRY_DSN: 'https://fakepublickey@fake.ingest.sentry.io/0000000',
      SENTRY_AUTH_TOKEN: 'fake-local-auth-token',
    };

    loadConfig(env);

    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe('');
    expect(env.SENTRY_AUTH_TOKEN).toBe('');
    // The actual server-side kill switch: provideObservability gates on
    // isPipelineRun, so a blank DSN alone would still leave the SDK live.
    expect(env.CI).toBe('true');
  });

  it('leaves a developer Sentry env untouched when scoring an already-deployed Preview', () => {
    const env: Record<string, string | undefined> = {
      LHCI_URL: 'https://corpus-preview.vercel.app',
      NEXT_PUBLIC_SENTRY_DSN: 'https://fakepublickey@fake.ingest.sentry.io/0000000',
      SENTRY_AUTH_TOKEN: 'fake-preview-auth-token',
    };

    loadConfig(env);

    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe('https://fakepublickey@fake.ingest.sentry.io/0000000');
    expect(env.SENTRY_AUTH_TOKEN).toBe('fake-preview-auth-token');
    expect(env.CI).toBeUndefined();
  });
});
