import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Already installed with LHCI; safeLoad parses the real workflow structure.
const { safeLoad } = createRequire(import.meta.url)('js-yaml') as {
  safeLoad: (source: string) => unknown;
};

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Workflow {
  env?: Record<string, string>;
  jobs: Record<
    string,
    {
      env?: Record<string, string>;
      steps: WorkflowStep[];
    }
  >;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('disposable-branch migration configuration', () => {
  it.each([
    ['ci', 'test'],
    ['preview', 'preview'],
  ])('%s supplies its direct Neon output to the actual Drizzle config', async (workflow, jobName) => {
    const definition = safeLoad(
      readFileSync(new URL(`../../.github/workflows/${workflow}.yml`, import.meta.url), 'utf8'),
    ) as Workflow;
    const job = definition.jobs[jobName];
    const migrations = job.steps.filter((step) => step.run?.trim() === 'bun run db:migrate');
    expect(migrations).toHaveLength(1);

    // Fresh runner scope: a different step's masking env is not inherited.
    vi.stubEnv('DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_URL_UNPOOLED', undefined);
    const migrationEnv = { ...definition.env, ...job.env, ...migrations[0].env };
    const neonOutputs = new Map([
      [`\${{ steps.neon.outputs.db_url }}`, 'direct-neon-output'],
      [`\${{ steps.neon.outputs.db_url_pooled }}`, 'pooled-neon-output'],
    ]);
    for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
      const expression = migrationEnv[name];
      if (expression === undefined) continue;
      expect(neonOutputs.has(expression), `${name} must resolve from a Neon output`).toBe(true);
      vi.stubEnv(name, neonOutputs.get(expression));
    }

    vi.resetModules();
    // defineConfig only constructs config; no driver or migrator is invoked.
    const { default: config } = await import('../../drizzle.config');
    const credentials = 'dbCredentials' in config ? config.dbCredentials : undefined;
    expect(
      credentials && 'url' in credentials && credentials.url === 'direct-neon-output',
      "Drizzle must receive the migration step's direct branch output",
    ).toBe(true);
  });

  it('refreshes the deterministic Preview Neon branch expiration after create or reuse', () => {
    const definition = safeLoad(
      readFileSync(new URL('../../.github/workflows/preview.yml', import.meta.url), 'utf8'),
    ) as Workflow;
    const steps = definition.jobs.preview.steps;
    const createIndex = steps.findIndex(
      (step) => step.name === 'Create or reuse preview Neon branch',
    );
    const refreshIndex = steps.findIndex(
      (step) => step.name === 'Refresh preview branch expiration',
    );

    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(refreshIndex).toBe(createIndex + 1);

    const refresh = steps[refreshIndex];
    expect(refresh.env).toMatchObject({
      NEON_API_KEY: `\${{ secrets.NEON_API_KEY }}`,
      NEON_PROJECT_ID: `\${{ vars.NEON_PROJECT_ID }}`,
      NEON_BRANCH_ID: `\${{ steps.neon.outputs.branch_id }}`,
      NEON_EXPIRES_AT: `\${{ steps.expiry.outputs.rfc3339 }}`,
    });
    expect(refresh.run).toContain('--request PATCH');
    expect(refresh.run).toContain(
      'https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$NEON_BRANCH_ID',
    );
    expect(refresh.run).toContain('"expires_at":"%s"');
  });
});
