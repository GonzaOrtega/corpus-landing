import type { RepoFacts } from './facts'

/**
 * The second axis, beside kind. Harvested from the per-capability adapter directories
 * that three repos in this portfolio arrived at independently, not invented here.
 *
 * Domain-specific directories found alongside them were deliberately excluded: a
 * capability must be something many projects need, or this table degenerates into a
 * per-project registry.
 */
export type Capability =
  | 'persistence' | 'auth' | 'http-api' | 'queue'
  | 'external-api' | 'file-upload' | 'notifications' | 'config-secrets'

export const CAPABILITIES: Capability[] = [
  'persistence', 'auth', 'http-api', 'queue',
  'external-api', 'file-upload', 'notifications', 'config-secrets',
]

/**
 * A dependency whose presence is sufficient evidence of a capability. Every literal below
 * was checked against the real package.json files (root and every nested package/app) of
 * the six repos in this portfolio. `/* anticipatory *\/` marks a literal that hit no repo
 * today — not a typo, just a package this portfolio has not reached for yet. Everything
 * else here was confirmed present, so a mapping that never fires is never a silent one.
 */
const BY_DEPENDENCY: Array<[Capability, string[]]> = [
  ['persistence', ['drizzle-orm', 'prisma' /* anticipatory */, 'pg', 'postgres']],
  ['queue', ['@aws-sdk/client-sqs', 'bullmq' /* anticipatory */]],
  ['notifications', ['resend', '@aws-sdk/client-ses', 'expo-notifications' /* anticipatory */]],
  ['file-upload', ['@vercel/blob', '@aws-sdk/client-s3']],
  ['auth', ['better-auth', 'next-auth' /* anticipatory */, '@auth/core' /* anticipatory */]],
  ['config-secrets', ['@aws-sdk/client-secrets-manager', '@aws-sdk/client-ssm']],
  ['http-api', ['hono', 'express' /* anticipatory */, 'fastify' /* anticipatory */]],
]

/**
 * A filename fragment, matched anywhere below `src`, that evidences a capability.
 * Some capabilities have no single tell-tale dependency — auth is frequently hand-rolled
 * middleware over a JWT library that a dozen unrelated features also use.
 */
const BY_FILE: Array<[Capability, string]> = [
  ['auth', 'auth.middleware.'],
  ['http-api', '.controller.'],
]

/**
 * The subset of `CAPABILITIES` that detection can actually evidence — every capability
 * reachable from `BY_DEPENDENCY` or `BY_FILE`. Derived rather than hand-listed so it
 * cannot drift out of sync with those tables as they grow.
 *
 * `external-api` is the one capability in the axis with no entry in either table: no
 * dependency scan generalizes across the unbounded registry of third-party SDKs, and no
 * filename convention is common enough to stand in for one. It stays declarable — a human
 * can still assert it — but Task 4's cross-check must consult this list before treating an
 * undetected capability as a finding. Some capabilities are a human's assertion that no
 * dependency or filename evidences, and a check that demands evidence for those cries wolf
 * forever.
 */
export const DETECTABLE: readonly Capability[] = CAPABILITIES.filter((c) =>
  BY_DEPENDENCY.some(([cap]) => cap === c) || BY_FILE.some(([cap]) => cap === c),
)

/**
 * Detection is truth; the declaration is a tested claim. Deliberately cheap — no AST, no
 * parser — because the engine that runs this carries no dependencies. A capability that
 * cannot be evidenced this way does not belong on the axis yet.
 */
export function detectCapabilities(r: RepoFacts): Capability[] {
  const found = new Set<Capability>()

  for (const [cap, packages] of BY_DEPENDENCY) {
    if (packages.some((p) => p in r.deps)) found.add(cap)
  }

  const srcFiles = [...r.listDeep('src'), ...r.listDeep('packages'), ...r.listDeep('apps')]
  for (const [cap, fragment] of BY_FILE) {
    if (srcFiles.some((f) => f.includes(fragment))) found.add(cap)
  }

  return CAPABILITIES.filter((c) => found.has(c))
}
