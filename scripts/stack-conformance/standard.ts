import { obligationsFor } from './blueprint'
import { DETECTABLE, detectCapabilities, type Capability } from './capabilities'
import { SHAPED_KINDS, shapeFor } from './conventions'
import { buildDepcruiseConfig, DC_TYPESCRIPT_RANGE, typescriptRangeStatus, type RepoShape } from './depcruise'
import { MAX_DECLARATION_BYTES, type DeclarationResult, type PackageManager } from './declaration'
import type { RepoFacts } from './facts'
import { cdkDir, type Detection, type Intent, type Kind } from './kinds'
import { truncate } from './sanitize'
import { parseYaml } from './yaml-subset'

export type { RepoFacts }
export type { Intent, Kind }

export const STANDARD_VERSION = 4
export type Status = 'green' | 'yellow' | 'red' | 'skip'
export type Dimension = 'ci' | 'deploy' | 'db' | 'ai' | 'testing' | 'hygiene' | 'docs'

export interface CheckResult {
  status: Status
  evidence: string
  hint?: string
}

export interface ClassificationContext {
  detection: Detection
  declaration: DeclarationResult
  /**
   * The kind checks are graded against: `decl?.pin?.kind ?? detection.kind`, the same
   * value `applicableChecks` already selects checks by (stack-audit.ts). Selection and
   * evaluation must read the same key, or a pinned repo is selected as one kind and
   * graded against another. `kind-declared-matches` and `kind-resolvable` are the
   * exception: they compare declared against detected on purpose, so they keep reading
   * `ctx.detection` — the generalisation "every check reads the resolved kind" was
   * drawn from those two comparators and does not hold for an enforcer.
   */
  effectiveKind: Kind
  /**
   * The capabilities checks are graded against: detected ∪ declared. The union rather than
   * the intersection, deliberately — a repo that has evidently grown a capability owes its
   * obligations whether or not anyone updated stack.json, and `capabilities-declared-matches`
   * separately reports the mismatch. Grading only what is declared would let the same
   * omission both hide the obligation and be its own excuse.
   */
  effectiveCapabilities: Capability[]
  /** Resolved once at the repo root and inherited by members, which have no stack.json. */
  effectivePackageManager: PackageManager
}

export interface CheckDef {
  id: string
  dimension: Dimension
  /** Structural applicability. */
  kinds: Kind[]
  /** Enforcement scope. Production-only unless a check opts into sandbox. */
  intents: Intent[]
  /** What this check reads. Printed at runtime, not merely commented. */
  inspects: string
  ciEligible: boolean
  run(r: RepoFacts, ctx: ClassificationContext): CheckResult
}

export const g = (evidence: string): CheckResult => ({ status: 'green', evidence })
export const bad = (status: 'red' | 'yellow', evidence: string, hint: string): CheckResult => ({
  status,
  evidence,
  hint,
})
export const skip = (evidence: string): CheckResult => ({ status: 'skip', evidence })

/**
 * Which layer-path table `.dependency-cruiser.json` is generated from. A repo carrying a
 * `packages/` directory keeps its layers in workspace packages; anything else nests them under
 * one `src/`.
 */
export const depcruiseShape = (r: RepoFacts): RepoShape => (r.files('packages') ? 'workspace' : 'single')

/**
 * Named exactly, because the hint it feeds used to say only "regenerate it from the blueprint
 * table" — an instruction with no executable behind it. The script lives in the stack repo that
 * owns the table (it is not part of the vendored engine, which carries the checker, not the
 * generators), and takes the repo to rewrite as its argument.
 */
export const REGENERATE_HINT = 'regenerate it — bun scripts/regenerate-depcruise.ts <repo-path>, in the stack repo that owns the blueprint table'

/**
 * The exact bytes `.dependency-cruiser.json` should hold for this repo. ONE function, TWO
 * consumers — `blueprint-depcruise-current` compares against it, `scripts/regenerate-depcruise.ts`
 * writes it — because a checker and a generator that each derive "what the config should be"
 * from their own copy of the derivation will eventually disagree, and the disagreement reads as
 * permanent drift on a repo that did exactly what the hint told it to.
 */
export const expectedDepcruiseConfig = (r: RepoFacts, ctx: ClassificationContext): string =>
  buildDepcruiseConfig(obligationsFor(ctx.effectiveKind, ctx.effectiveCapabilities), depcruiseShape(r))

/** Deployable application kinds — what `PROD` used to mean. */
export const APP_KINDS: Kind[] = ['next-app', 'expo-app', 'cdk-service', 'lambda-service']
/** Checks that care about nothing but repo hygiene, so they also cover `other`. */
export const ANY_KIND: Kind[] = [
  ...APP_KINDS,
  'workspace',
  'package',
  'cli',
  'cdk-library',
  'static-site',
  'docs-repo',
  'toolkit',
  'other',
]

export const PRODUCTION_ONLY: Intent[] = ['production']
export const PRODUCTION_AND_SANDBOX: Intent[] = ['production', 'sandbox']
const CLASSIFICATION_CHECK_IDS = new Set([
  'stack-declaration',
  'kind-declared-matches',
  'kind-resolvable',
])

export function applicableChecks(
  kind: Kind,
  intent: Intent,
  opts: { ci?: boolean },
): CheckDef[] {
  if (intent === 'exempt') return []
  return CHECKS.filter(
    (c) =>
      (c.kinds.includes(kind) || CLASSIFICATION_CHECK_IDS.has(c.id)) &&
      c.intents.includes(intent) &&
      (!opts.ci || c.ciEligible),
  )
}

export const CHILD_EXCLUDED_IDS = new Set([
  // The declaration is a repo-root fact: "stack.json lives at the repo root only.
  // Each workspace member gets its own detected kind and inherits the root's
  // intent." A member that carried its own would be the defect, so asking one for
  // it inverted the rule. `kind-resolvable` deliberately stays: every member does
  // have to resolve to a kind, and it is the only one of the three that can red.
  'stack-declaration',
  'lockfile',
  'env-gitignore',
  'env-example',
  'claude-md',
  'docs-context',
  'settings-plugins',
  'protected-files',
  'vitest-setup',
  'seed-script',
  'docs-trio',
  'compose-name',
  'compose-db-loopback',
  'compose-image-pinned',
  'compose-env-tracked',
  'compose-profile-deps',
  'compose-healthcheck',
  'compose-depends-healthy',
  'compose-dead-polling',
  'compose-duplicate-service',
  'local-env-path',
  // Root-only for the same reason as `stack-declaration` above, but reached from the other
  // direction: the artifact IS a root fact. `scaffoldFor(kind, caps, 'workspace')` emits exactly
  // one `.dependency-cruiser.json`, at the workspace root, and its cross-package rule
  // (`^packages/core/` -> `^packages/adapters/`) is an edge no member can even express — a member
  // sees only its own tree. Asked of a member, the check rebases onto that member's root, finds
  // neither the config nor the devDependency, and reds every time; the one place the artifact
  // actually lives was never checked, because 'workspace' was not in `kinds`. Adding the kind
  // without this exclusion would double-report; this exclusion without the kind would silence it
  // entirely. The pair is the fix.
  'blueprint-depcruise-current',
])

const stripYamlComments = (s: string): string => s.split('\n').filter((l) => !/^\s*#/.test(l.trim())).join('\n')

const htmlPages = (r: RepoFacts): string[] =>
  r.list('.').filter((f) => f.endsWith('.html'))

const jsonObject = (raw: string | null): Record<string, unknown> | null => {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Mirrors jsonObject. parseYaml throws on malformed or unsupported input and
 * can return any JS value, so a compose file that is valid YAML but not a
 * mapping (a bare list, a string) must fail the same way an unparseable one
 * does — silently treating it as "no compose file" would let a broken file pass
 * every check in this dimension.
 */
const composeObject = (raw: string | null): Record<string, unknown> | null => {
  if (raw === null) return null
  try {
    const parsed: unknown = parseYaml(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Every compose file in the repo, at any depth. listDeep already excludes
 * node_modules and .git. Both spellings and both prefixes are matched because
 * the portfolio currently holds three of the four.
 */
const COMPOSE_RE = /(^|\/)(docker-)?compose(\.[a-z0-9-]+)?\.ya?ml$/
const composeFiles = (r: RepoFacts): string[] =>
  r.listDeep('.').filter((f) => COMPOSE_RE.test(f))

/**
 * Obligation scopes ('ports', 'use-cases', 'adapters', 'src') are conceptual — the same
 * rule applies whether a node keeps its source at `src/ports` or, one level further in
 * because the node itself is `packages/core`, at `src/core/ports`. Resolving a scope to a
 * FIXED sub-path (`core/src/ports`) only holds for a repo shaped exactly like the reference
 * one; two of six portfolio repos are workspaces whose members keep source under their own
 * `src/`, and a fixed-root reading would call `listDeep` on a path that never exists there
 * and silently find nothing. Matching `scope` as a path SEGMENT, at any depth, is what makes
 * this depth-agnostic: `email.port.ts` under `core/src/ports` and under `src/ports` both
 * carry a `ports` segment and both resolve.
 *
 * Segment equality, never substring — mirrors `shape-committed-junk` below, which anchors
 * the same way for the same reason (`portfolio-notes.md` must not match a `notes` scope).
 *
 * Takes the file list rather than `r` itself so a caller checking several scopes — as
 * `blueprint-naming` does, one per obligation — walks the tree once and filters it
 * repeatedly, instead of re-walking per obligation.
 */
const filesInScope = (files: string[], scope: string): string[] =>
  files.filter((f) => f.split('/').slice(0, -1).includes(scope))

/**
 * Both conventions in use across the repos this standard governs, because they use both: a
 * co-located `__tests__/` directory, and a `.test.ts`/`.spec.ts` suffix beside the file under
 * test. Matching only one of them would leave half of them inside a scope the obligation
 * says it does not govern.
 */
const isTestFile = (f: string): boolean =>
  f.split('/').slice(0, -1).includes('__tests__') || /\.(test|spec)\.tsx?$/.test(f)

/**
 * States what a scope-and-pattern check actually exercised, not just the obligation count.
 * A single shared counter (the previous shape of both `blueprint-naming` and
 * `blueprint-construction`) goes non-zero the moment ANY obligation's scope has a qualifying
 * file, so a green verdict could read "N obligations satisfied" while some of those N had
 * nothing in their own scope to read at all — the obligation was never exercised, only
 * assumed clean because a sibling obligation's scope happened to have content. Taking the set
 * of obligation ids that were actually exercised (each added only once its own scope yielded
 * at least one file) lets the message state both halves: how many ran, out of how many exist,
 * and — when they differ — which ones didn't, so nothing is credited as satisfied that was
 * never examined.
 */
const coverageMessage = (label: string, rules: { id: string }[], exercised: Set<string>): string => {
  if (exercised.size === rules.length) return `${rules.length} ${label} obligations satisfied`
  const unexercised = rules.map((o) => o.id).filter((id) => !exercised.has(id))
  return `${exercised.size} of ${rules.length} ${label} obligations exercised, none violated (not exercised: ${unexercised.join(', ')})`
}

/**
 * Every import/export/dynamic-import specifier string in `body`, extracted without parsing
 * TypeScript — S1 forbids that in the vendored engine, so this is string matching over file
 * contents, the same operation blueprint-construction already performs for `new XAdapter(`,
 * applied to specifiers instead of constructor calls. `from '...'` covers a static import in
 * any form (default, named, namespace, type-only) and a re-export (`export { x } from '...'`,
 * `export * from '...'`); `import(...)` covers the dynamic form. A side-effect import with no
 * `from` (`import '../adapters/db'`) and a CommonJS `require(...)` are both out of reach the
 * same way a barrel re-export is — named misses, not silent drops.
 */
const IMPORT_SPECIFIER_RE = /\bfrom\s*(['"])((?:(?!\1).)*)\1|\bimport\s*\(\s*(['"])((?:(?!\3).)*)\3/g

/**
 * True when some import/export/dynamic-import specifier in `body` carries `to` as an EXACT
 * path segment — never a substring, so `../my-adapters-helper` does not match a `to` of
 * `adapters`, mirroring filesInScope's own segment-equality discipline. An alias maps a
 * PREFIX (`@/adapters/db`, `@org/adapters`), so the layer name survives literally in the
 * remainder regardless of how the prefix resolves — the property that makes a pattern
 * GENERATED from the obligation table viable where a hand-enumerated one was rejected.
 */
const importsSegment = (body: string, to: string): boolean => {
  IMPORT_SPECIFIER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMPORT_SPECIFIER_RE.exec(body))) {
    const specifier = m[2] ?? m[4]
    if (specifier?.split('/').includes(to)) return true
  }
  return false
}

/**
 * Collapses `.` and `..` segments the way git's own paths are already
 * normalised, without `node:path` — vendored files run under plain node and
 * carry no dependencies. Returns `null`, rather than a truncated string, when
 * the path is unmatchable against repo-relative git output: a leading `/`
 * (absolute, outside the repo) or a `..` that climbs past the top (also
 * outside the repo). A git-tracked path can never resolve outside the
 * repository by construction, so silently truncating those cases — the
 * previous behaviour — could only ever produce a false match, never a true
 * one; dropping them instead removes the false positive with no false
 * negative.
 */
const normalizeRelPath = (p: string): string | null => {
  if (p.startsWith('/')) return null
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(seg)
  }
  return out.join('/')
}

/**
 * env_file entries, normalised. Accepts the string form, the list form, and the
 * long form with `path:`/`required:`. Paths resolve against the compose file's
 * own directory, not the repo root — so `docker/compose.yml` with `../.env`
 * must collapse to the repo-root `.env`, matching what `git ls-files` emits.
 * An absolute path ignores the compose directory entirely (Compose's own
 * semantics), so it is left unprefixed before normalising.
 */
const envFilePaths = (service: Record<string, unknown>, composeDir: string): string[] => {
  const raw = service.env_file
  const entries = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []
  const join = (p: string): string | null =>
    normalizeRelPath(p.startsWith('/') || composeDir === '.' ? p : `${composeDir}/${p}`)
  const toList = (j: string | null): string[] => (j === null ? [] : [j])
  return entries.flatMap((e): string[] => {
    if (typeof e === 'string') return toList(join(e))
    if (e !== null && typeof e === 'object' && !Array.isArray(e)) {
      const path = (e as Record<string, unknown>).path
      if (typeof path === 'string') return toList(join(path))
    }
    return []
  })
}

const profilesOf = (service: Record<string, unknown>): string[] =>
  Array.isArray(service.profiles) ? service.profiles.filter((p): p is string => typeof p === 'string') : []

/**
 * A service worth probing: it publishes a port, or something waits on it for
 * anything other than completion. service_completed_successfully is excluded
 * because a one-shot migration job is frequently depended upon, and demanding a
 * healthcheck of a container whose purpose is to exit is noise.
 *
 * Known gap, accepted: a background worker with no ports that nothing depends on
 * reads as one-shot and goes unchecked. No such service exists in the portfolio,
 * and widening the rule would start flagging genuine one-shots.
 *
 * False positive, accepted: a genuine one-shot job reached only via the BARE list
 * form (`depends_on: [migrate]`) is flagged for missing a healthcheck, because the
 * bare form carries no `condition` to exempt it — only the long form's
 * `service_completed_successfully` does that. The practical remedy — switching to
 * `depends_on: { migrate: { condition: service_completed_successfully } }` — also
 * fixes an underlying sequencing bug (the bare form only waits for the container
 * to start, not for the job to finish), so the false positive points at something
 * worth changing anyway rather than at noise to suppress.
 */
const isLongRunning = (
  name: string,
  service: Record<string, unknown>,
  all: Record<string, Record<string, unknown>>,
): boolean => {
  if (publishedPorts(service).length) return true
  for (const other of Object.values(all)) {
    const dep = other.depends_on
    if (Array.isArray(dep) && dep.includes(name)) return true
    if (dep !== null && typeof dep === 'object' && !Array.isArray(dep)) {
      const body = (dep as Record<string, unknown>)[name]
      if (body === undefined) continue
      const condition =
        body !== null && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>).condition
          : undefined
      if (condition !== 'service_completed_successfully') return true
    }
  }
  return false
}

/**
 * depends_on names, plus whether each was declared optional. The short form is a
 * list of names; the long form is a mapping whose values may carry
 * `required: false`, which makes an otherwise-unsatisfiable dependency legal.
 */
const dependsOnNames = (service: Record<string, unknown>): Array<{ name: string; required: boolean }> => {
  const dep = service.depends_on
  if (Array.isArray(dep))
    return dep.filter((d): d is string => typeof d === 'string').map((name) => ({ name, required: true }))
  if (dep !== null && typeof dep === 'object') {
    return Object.entries(dep as Record<string, unknown>).map(([name, body]) => {
      const required =
        body !== null && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>).required !== false
          : true
      return { name, required }
    })
  }
  return []
}

/** The `services` mapping, or an empty object when absent or malformed. */
const composeServices = (doc: Record<string, unknown>): Record<string, Record<string, unknown>> => {
  const svc = doc.services
  if (svc === null || typeof svc !== 'object' || Array.isArray(svc)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [name, body] of Object.entries(svc as Record<string, unknown>)) {
    if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
      out[name] = body as Record<string, unknown>
    }
  }
  return out
}

/**
 * Published ports in the short string form. The long mapping form
 * (`- target: 5432` / `published: "5432"`) is also normalised here, because a
 * check that only understood one spelling would pass a file that used the other.
 */
const publishedPorts = (service: Record<string, unknown>): string[] => {
  const ports = service.ports
  if (!Array.isArray(ports)) return []
  return ports.flatMap((p): string[] => {
    if (typeof p === 'string') return [p]
    // `ports: [5432]` is valid Compose — the bare short form with no colon at
    // all — and the vendored parser reads an unquoted number as a JS number,
    // not a string. Losing it here would be a false negative in a red check,
    // the worse direction to fail in.
    if (typeof p === 'number') return [String(p)]
    if (p !== null && typeof p === 'object' && !Array.isArray(p)) {
      const entry = p as Record<string, unknown>
      const host = entry.host_ip
      const published = entry.published
      if (published === undefined) return []
      return [`${typeof host === 'string' ? `${host}:` : ''}${String(published)}`]
    }
    return []
  })
}

// Stateful services whose port is worth protecting. Matched against the image
// name, which is the one reliable signal: service names are arbitrary
// (`db`, `postgres`, `pg`, `database` all appear in the wild).
//
// This is an explicit, CLOSED list, not a pattern — deliberately so. A
// hyphen after the base name cannot be told apart by regex alone: it is a
// datastore EDITION for `redis-stack` and `elasticmq-native`, but a wholly
// different, unrelated tool for `redis-commander` (an admin UI), `mongo-express`
// (an admin UI) and `rabbitmq-exporter` (a metrics exporter). So each name
// below matches only followed by `:` (a tag) or end-of-string, and known
// hyphenated editions are listed as their own entries rather than opening the
// boundary for every name. The trade-off this buys: an edition that is not
// yet listed here is a false negative, not a false positive — add it here
// when one turns up in the portfolio, rather than loosening the boundary.
const DB_IMAGE_NAMES = [
  'postgres',
  'mysql',
  'mariadb',
  'mongo',
  'redis',
  'redis-stack',
  'redis-stack-server',
  'elasticmq',
  'elasticmq-native',
  'rabbitmq',
] as const
const DB_IMAGE_RE = new RegExp(`(^|/)(${DB_IMAGE_NAMES.join('|')})(:|$)`, 'i')

// Strips /* … */ blocks and only those // comments that OWN their line. Deliberately
// NOT every `//`: a header VALUE routinely contains `https://…`, and cutting from the
// first `//` on a line would take any header name that follows it on that line with it.
// The realistic false-pass shape — a commented-out header block — starts each of its
// lines with `//`, which this does catch. A trailing `// TODO: add X-Frame-Options` on a
// line of live code still reads as evidence; that is the accepted residual.
const stripJsComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

export const VERCEL_SCHEMA_URL = 'https://openapi.vercel.sh/vercel.json'

const REQUIRED_SECURITY_HEADERS = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
] as const

// Vercel honours both vercel.json `headers` and a Next.js `headers()` in next.config.*,
// with no documented precedence, and middleware can set them at runtime. Reading only
// vercel.json false-positived on four real apps that use next.config.ts (AUD-3).
const HEADER_SOURCES = [
  'vercel.json',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'middleware.ts',
  'middleware.js',
  'src/middleware.ts',
  'src/middleware.js',
] as const

// Where a repo keeps its CDK app. `.` is a scaffolded aws-service; `cdk/` is used by
// one real aws-service repo; `../../infra` is a monorepo child whose CDK app lives at
// the workspace root two levels up (a `<repo>/apps/api` shape). A hardcoded `infra/`
// missed both real repos — AUD-5.
const CDK_DIRS = ['.', 'infra', 'cdk', '../../infra'] as const

const under = (dir: string, rel: string): string => (dir === '.' ? rel : `${dir}/${rel}`)

const findCdkDir = (r: RepoFacts): string | null =>
  CDK_DIRS.find((d) => r.read(under(d, 'cdk.json')) !== null) ?? null

const depsOf = (pkg: Record<string, unknown> | null): Record<string, unknown> => ({
  ...(pkg?.dependencies as Record<string, unknown> | undefined),
  ...(pkg?.devDependencies as Record<string, unknown> | undefined),
})

const NO_CDK_APP = `no cdk.json in ${CDK_DIRS.join(', ')}`

// vercel.json is absent, unparseable, or an object — and the three vercel-* checks below
// must react differently to each. Absent is a `skip`, never a finding (AUD-2).
type VercelJson =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'ok'; cfg: Record<string, unknown> }

const readVercelJson = (r: RepoFacts): VercelJson => {
  const raw = r.read('vercel.json')
  if (raw === null) return { kind: 'missing' }
  const cfg = jsonObject(raw)
  return cfg ? { kind: 'ok', cfg } : { kind: 'invalid' }
}

// A workflow holds a LONG-LIVED key when an AWS credential name sits next to a value
// that can only be a long-lived credential. Three such shapes, and name adjacency is
// required for all of them:
//   1. `${{ secrets.… }}`          — a stored secret being injected
//   2. `AKIA…` (16 upper/digits)   — a literal access key id
//   3. 40 chars of base64          — a literal SECRET access key, which has no prefix
//                                    of its own to recognise
// Gating on the VALUE rather than on the assignment shape is what keeps prose out: a
// step `name:`, an `echo` string, a URL query, an `if: contains(…)`, a trailing
// `# rotate …` comment and a `KEY=your-key-here` doc example all carry values that are
// none of the three. (Trailing comments matter — stripYamlComments only removes
// comments that own a whole line.) It also keeps OIDC pass-through out without any
// lookahead: configure-aws-credentials exports AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY *and* AWS_SESSION_TOKEN into the job env on the OIDC path
// (`output-env-credentials` defaults to true), and `$X` / `"$X"` / `${X}` /
// `${{ env.… }}` are none of the three shapes either.
// Name adjacency is what makes shape 3 safe: `[A-Za-z0-9/+=]{40}` alone would match
// every SHA-pinned action ref (40 hex is valid base64), which this repo requires.
// The block-scalar branch is the ONLY way a newline can be crossed. A YAML block scalar
// (`KEY: |`, `KEY: >`, with optional chomping `-`/`+` and an optional indentation digit)
// puts its value on the following line, out of reach of a same-line pattern — and it is
// the idiom people reach for to avoid escaping `/` in a secret-shaped string. The `:`
// before the header is MANDATORY on this branch — unlike the same-line branch, where
// `[:=]?` stays optional to admit shell `KEY=value` assignments — because a YAML block
// scalar can only be introduced by a key separator. Without that mandatory colon, a
// shell pipe (`AWS_SECRET_ACCESS_KEY |`) or a `>` redirect at the end of a `run:` line
// would itself satisfy the header and let the pattern cross into whatever value sits on
// the next line, unrelated to the name above it. Gating the newline on the
// colon-anchored header, rather than allowing `\s*` generally, is what stops the name on
// one line from pairing with an unrelated 40-char value further down the file.
// Accepted residuals: a bare literal with no adjacent credential name (raw secret
// scanning is gitleaks' job); a short placeholder value (`KEY=changeme`), which is not a
// credential; a plain multi-line YAML scalar — `KEY:` then the value on an indented next
// line with no `|`/`>` header, which is valid YAML but deliberately not matched, since an
// indentation-sensitive rule cannot be expressed safely here; `AWS__SECRET_ACCESS_KEY`
// with a double separator; and bare `ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` without the `AWS`
// prefix, used by some S3-compatible tooling — deliberately not matched, since neither
// authenticates the AWS SDK and widening buys false-positive risk for no security gain.
// Exported (not just module-private) so checks-aws-mono.test.ts can exercise it directly
// against a committed case table (AWS_STATIC_KEY_CASES), rather than only indirectly
// through auditRepo() — a table living in the test suite, not a scratch script, cannot
// shrink unnoticed on a future rewrite.
export const STATIC_KEY =
  /(?:aws[-_]?access[-_]?key[-_]?id|aws[-_]?secret[-_]?access[-_]?key)[ \t]*(?::[ \t]*[|>][-+]?\d?[-+]?[ \t]*\r?\n[ \t]*|[:=]?[ \t]*)["']?(?:\$\{\{[ \t]*secrets\.|AKIA[0-9A-Z]{16}\b|[A-Za-z0-9/+=]{40})/i

/**
 * Plain arithmetic, not Bun.semver — this file is vendored into repos that run
 * it under node, where every Bun global throws ReferenceError.
 *
 * Only the major matters: Turbopack became the default dev bundler in Next 16,
 * which is the entire question. `^15.1.0` → 15 → honoured; `16.1.6` → 16 → dead.
 *
 * The regex requires a literal `x.y.z` — a declared value with no numeric major
 * (pnpm `catalog:`, `workspace:*`, `latest`, or a bare `^16.0`) doesn't match and
 * reads as green, same as no polling at all. `catalog:` is the one worth naming:
 * it's a real and growing pnpm-monorepo pattern, not a hypothetical — and it's
 * how a pnpm monorepo in this portfolio could plausibly pin `next` in practice.
 * Known limitation, not fixed here — see the check's own comment below.
 */
const nextMajorAtLeast16 = (declared: string): boolean => {
  const match = declared.match(/(\d+)\.\d+\.\d+/)
  return match ? Number(match[1]) >= 16 : false
}

/**
 * `.test.` / `.spec.` as an infix, before the extension. A file merely NAMED test.ts is
 * a helper, not a test — the two fixtures asserting that are the reason this is an infix
 * match and not a basename match.
 */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/

/**
 * A colocated test is named after the thing it tests, not a new kind of thing — `EnrichQueue.test.ts`
 * is a test of `EnrichQueue.ts` and should be judged exactly as `EnrichQueue.ts` would be. Stripping
 * the infix and matching the normalized name, rather than excluding the file from consideration
 * entirely, is what keeps every naming obligation's reach intact: a correctly-named colocated test
 * (`email.port.test.ts` -> `email.port.ts`) passes every rule its normal counterpart would, and a
 * mis-cased one (`EnrichQueue.test.ts` -> `EnrichQueue.ts`) still fails kebab-case, exactly as
 * `EnrichQueue.ts` itself would. Excluding the file outright silently switched off every obligation
 * at once, including the one — files-are-kebab-case — that never had a false positive to fix.
 */
const stripTestInfix = (base: string): string => base.replace(/\.(test|spec)\.([cm]?[jt]sx?)$/, '.$2')

/** Committing these is a merge hazard and can bake environment values into git history. */
const JUNK_RED = new Set(['node_modules', 'dist', '.next'])

export const CHECKS: CheckDef[] = [
  {
    id: 'lockfile',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'the declared package manager against the lockfiles present at the repo root',
    ciEligible: true,
    run(r, ctx) {
      const pm = ctx.effectivePackageManager
      const LOCKS: Record<string, string[]> = {
        bun: ['bun.lock', 'bun.lockb'],
        pnpm: ['pnpm-lock.yaml'],
        npm: ['package-lock.json'],
        yarn: ['yarn.lock'],
      }
      const own = LOCKS[pm]!
      const foreign = Object.entries(LOCKS)
        .filter(([m]) => m !== pm)
        .flatMap(([, names]) => names)
        .filter((f) => r.files(f))
      if (foreign.length)
        return bad('red', `foreign lockfiles for ${pm}: ${foreign.join(', ')}`, `delete them — ${pm} only`)
      if (!own.some((f) => r.files(f)))
        return bad('red', `no ${own[0]}`, `run ${pm} install to create the lockfile`)
      return g(`${own.find((f) => r.files(f))} only`)
    },
  },
  {
    id: 'claude-md',
    dimension: 'ai',
    kinds: ANY_KIND,
    intents: PRODUCTION_ONLY,
    inspects: 'presence of CLAUDE.md at the repo root',
    ciEligible: true,
    run(r) {
      return r.files('CLAUDE.md')
        ? g('CLAUDE.md present')
        : bad('red', 'no CLAUDE.md', 'write a CLAUDE.md (purpose, stack, commands, invariants)')
    },
  },
  {
    id: 'ci-workflow',
    dimension: 'ci',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'the content of .github/workflows/ci.yml for typecheck, test and lint commands',
    ciEligible: true,
    run(r, ctx) {
      const pm = ctx.effectivePackageManager
      const raw = r.read('.github/workflows/ci.yml')
      if (!raw)
        return bad('red', 'no .github/workflows/ci.yml', `add ci.yml: lint + tsc --noEmit + vitest via ${pm}`)
      const ci = stripYamlComments(raw)
      const missing = (
        [
          [/tsc --noEmit|typecheck/, 'typecheck'],
          [/vitest|bun test|bun run test/, 'tests'],
          [/lint|biome|eslint/, 'lint'],
        ] as Array<[RegExp, string]>
      )
        .filter(([re]) => !re.test(ci))
        .map(([, name]) => name)
      return missing.length
        ? bad('yellow', `ci.yml missing: ${missing.join(', ')}`, 'cover lint + typecheck + tests in ci.yml')
        : g('ci.yml covers lint/typecheck/tests')
    },
  },
  {
    id: 'e2e-workflow',
    dimension: 'ci',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'the @playwright/test dependency and workflow contents for a playwright command',
    ciEligible: true,
    run(r) {
      if (!r.deps['@playwright/test']) return skip('no @playwright/test dependency')
      return /playwright/i.test(stripYamlComments(r.wfContent()))
        ? g('a workflow runs playwright')
        : bad('red', 'playwright dep but no e2e workflow', 'add e2e.yml running playwright via bun')
    },
  },
  {
    id: 'workflow-hygiene',
    dimension: 'ci',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'every .github/workflows/*.yml file for permissions and SHA-pinned third-party actions',
    ciEligible: true,
    run(r) {
      if (!r.workflows().length) return skip('no workflows')
      const issues: string[] = []
      for (const f of r.workflows()) {
        const c = r.read(`.github/workflows/${f}`) ?? ''
        if (!/^\s*permissions\s*:/m.test(c)) issues.push(`${f}: no permissions block`)
        for (const m of c.matchAll(/uses:\s*([^\s@]+)@(\S+)/g)) {
          const [, action, ref] = m
          if (action && ref && !action.startsWith('actions/') && !/^[0-9a-f]{40}$/.test(ref))
            issues.push(`${f}: unpinned ${action}`)
        }
      }
      return issues.length
        ? bad('yellow', issues.join('; '), 'add least-privilege permissions:, pin third-party actions to SHAs')
        : g('workflows have permissions + pinned actions')
    },
  },
  {
    id: 'vercel-config',
    dimension: 'deploy',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'presence of vercel.json at the repo root',
    ciEligible: true,
    run(r) {
      return r.files('vercel.json')
        ? g('vercel.json present')
        : bad('red', 'no vercel.json', 'commit a vercel.json (framework config)')
    },
  },
  {
    id: 'vercel-linked',
    dimension: 'deploy',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'presence of .vercel/project.json',
    ciEligible: false,
    run(r) {
      return r.files('.vercel/project.json')
        ? g('Vercel project linked')
        : bad('yellow', 'repo not linked to a Vercel project', 'run vercel link')
    },
  },
  {
    id: 'env-example',
    dimension: 'deploy',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'package.json dependencies, vercel.json and the presence of .env.example',
    ciEligible: true,
    run(r) {
      if (!r.deps['drizzle-orm'] && !r.files('vercel.json')) return skip('no env-consuming markers')
      return r.files('.env.example')
        ? g('.env.example documents env var names')
        : bad('red', 'no .env.example', 'document required env var NAMES (never values) in .env.example')
    },
  },
  {
    id: 'migrations-exist',
    dimension: 'db',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'drizzle.config files and .sql migration files under drizzle/ or migrations/',
    ciEligible: true,
    run(r) {
      if (!r.deps['drizzle-orm']) return skip('no drizzle-orm')
      const hasConfig =
        r.files('drizzle.config.ts') || r.files('drizzle.config.js') || r.files('drizzle.config.json')
      const sql = [...r.list('drizzle'), ...r.list('migrations'), ...r.list('drizzle/migrations')].filter(
        (f) => f.endsWith('.sql'),
      )
      if (!hasConfig) return bad('red', 'no drizzle.config.*', 'add drizzle config; generate migrations')
      return sql.length
        ? g(`${sql.length} committed migration(s)`)
        : bad('red', 'no committed .sql migrations', 'generate migrations with drizzle-kit; never hand-edit the DB')
    },
  },
  {
    id: 'db-workflow',
    dimension: 'db',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'workflow content for a database migration command when drizzle-orm is installed',
    ciEligible: true,
    run(r) {
      if (!r.deps['drizzle-orm']) return skip('no drizzle-orm')
      return /migrate/i.test(stripYamlComments(r.wfContent()))
        ? g('a workflow runs migrations')
        : bad('yellow', 'no workflow mentions migrate', 'run prod migrations via workflow only, never local psql')
    },
  },
  {
    id: 'neon-ci-db',
    dimension: 'db',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'workflow content for DATABASE_URL or NEON when drizzle-orm is installed',
    ciEligible: true,
    run(r) {
      if (!r.deps['drizzle-orm']) return skip('no drizzle-orm')
      return /DATABASE_URL|NEON/i.test(stripYamlComments(r.wfContent()))
        ? g('CI wires a database URL (Neon branch expected)')
        : bad('yellow', 'CI has no DATABASE_URL wiring', 'point CI tests at a Neon branch, never prod')
    },
  },
  {
    id: 'seed-script',
    dimension: 'db',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'package.json script names for a seed script when drizzle-orm is installed',
    ciEligible: true,
    run(r) {
      if (!r.deps['drizzle-orm']) return skip('no drizzle-orm')
      const scripts = Object.keys(r.pkg?.scripts ?? {})
      return scripts.some((s) => /seed/i.test(s))
        ? g('seed script present')
        : bad('yellow', 'no seed script', 'add a db seed script for reproducible local/test data')
    },
  },
  {
    id: 'settings-plugins',
    dimension: 'ai',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'the enabledPlugins field in .claude/settings.json',
    ciEligible: false,
    run(r) {
      const raw = r.read('.claude/settings.json')
      if (!raw) return bad('yellow', 'no .claude/settings.json', 'add per-project enabledPlugins per the curation matrix')
      try {
        const parsed = JSON.parse(raw)
        return parsed.enabledPlugins
          ? g('.claude/settings.json with enabledPlugins')
          : bad('yellow', 'settings.json has no enabledPlugins', 'add enabledPlugins per the curation matrix')
      } catch {
        return bad('red', '.claude/settings.json is invalid JSON', 'fix the JSON')
      }
    },
  },
  {
    id: 'protected-files',
    dimension: 'ai',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'fragile-file language in CLAUDE.md and entries in .claude/protected-files.txt',
    ciEligible: true,
    run(r) {
      const md = r.read('CLAUDE.md')
      if (!md) return skip('no CLAUDE.md (claude-md check covers that)')
      const fragile =
        /do ?n[o']t (change|modify|touch|edit|delete)|do not (change|modify|touch|edit|delete)|never (change|modify|edit|touch)|must not be (changed|modified|edited)|fragile|NOT to change/i.test(
          md,
        )
      if (!fragile) return g('CLAUDE.md names no fragile files')
      const list = r.read('.claude/protected-files.txt') ?? ''
      const entries = list.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
      return entries.length
        ? g(`protected-files.txt with ${entries.length} entries`)
        : bad('yellow', 'CLAUDE.md names fragile files but .claude/protected-files.txt is empty/missing', 'populate protected-files.txt so the guard hook enforces the list')
    },
  },
  {
    id: 'docs-context',
    dimension: 'ai',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'Markdown files below docs/context/',
    ciEligible: true,
    run(r) {
      // Deep: a repo that files context docs into numbered subdirectories
      // (docs/context/02-decisions/0001-....md) has more context, not less.
      const md = r.listDeep('docs/context').filter((f) => f.endsWith('.md'))
      return md.length
        ? g(`${md.length} md file${md.length === 1 ? '' : 's'} under docs/context/`)
        : bad('yellow', 'no markdown under docs/context/', 'add scope/architecture context docs (role agents read these first)')
    },
  },
  {
    id: 'vitest-setup',
    dimension: 'testing',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'the vitest dependency plus vitest config files or a package.json test script',
    ciEligible: true,
    run(r) {
      const wired =
        r.deps.vitest &&
        (r.files('vitest.config.ts') || r.files('vitest.config.mts') || r.pkg?.scripts?.test)
      return wired
        ? g('vitest wired')
        : bad('red', 'vitest missing or unwired', 'add vitest + a test script')
    },
  },
  {
    id: 'playwright-setup',
    dimension: 'testing',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'the @playwright/test dependency and playwright.config.ts or playwright.config.mts',
    ciEligible: true,
    run(r) {
      if (!r.deps['@playwright/test']) return skip('no @playwright/test dependency')
      return r.files('playwright.config.ts') || r.files('playwright.config.mts')
        ? g('playwright config present')
        : bad('yellow', 'playwright dep but no config', 'add playwright.config.ts covering critical flows')
    },
  },
  {
    id: 'ts-strict',
    dimension: 'hygiene',
    kinds: APP_KINDS,
    intents: PRODUCTION_ONLY,
    inspects: 'tsconfig.json and inherited tsconfig.base.json for compilerOptions.strict set to true',
    ciEligible: true,
    run(r) {
      const ts = r.read('tsconfig.json')
      if (!ts) return bad('red', 'no tsconfig.json', 'add a strict tsconfig')
      if (/"strict"\s*:\s*true/.test(ts)) return g('TS strict')
      const ext = ts.match(/"extends"\s*:\s*"([^"]+)"/)?.[1]
      if (ext?.includes('tsconfig.base')) {
        const base = r.read('../../tsconfig.base.json') ?? r.read('../tsconfig.base.json')
        if (base && /"strict"\s*:\s*true/.test(base)) return g('strict via tsconfig.base')
      }
      return bad('red', 'tsconfig strict is not true', 'enable "strict": true')
    },
  },
  {
    id: 'env-gitignore',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: '.gitignore entries that cover .env files while retaining .env.example',
    ciEligible: true,
    run(r) {
      const gi = r.read('.gitignore') ?? ''
      const lines = gi.split('\n').map((l) => l.trim().replace(/\s+#.*$/, ''))
      const covered = lines.some((l) => /^\/?\.env(\.?\*)?$/.test(l) || l === '.env*' || l === '*.env' || /^\/?\.env\.\*$/.test(l))
      return covered
        ? g('.env* gitignored')
        : bad('red', '.gitignore does not cover .env files', 'ignore .env* (keep .env.example tracked)')
    },
  },
  {
    id: 'ports-registry',
    dimension: 'hygiene',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'the parent .ports.json registry entry for this repository folder',
    ciEligible: false,
    run(r) {
      const registry = r.read('../.ports.json')
      if (registry === null) return skip('no ../.ports.json (not the /github layout)')
      try {
        const ports = JSON.parse(registry)
        const folder = r.root.split('/').filter(Boolean).pop()!
        return ports[folder] !== undefined
          ? g(`registered on port ${ports[folder]}`)
          : bad('yellow', 'not in .ports.json', 'register per the /github CLAUDE.md convention (ask first)')
      } catch {
        return bad('yellow', '../.ports.json unreadable', 'fix the registry JSON')
      }
    },
  },
  {
    id: 'cdk-diff-workflow',
    dimension: 'deploy',
    kinds: ['cdk-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'the concatenated text of every .github/workflows/*.yml file, for the string "cdk diff"',
    ciEligible: true,
    run(r) {
      return /cdk diff/.test(stripYamlComments(r.wfContent()))
        ? g('cdk diff runs in CI')
        : bad('red', 'no workflow runs cdk diff', 'add cdk-diff.yml on pull_request')
    },
  },
  {
    id: 'cdk-deploy-gated',
    dimension: 'deploy',
    kinds: ['cdk-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'workflow files that run cdk deploy, for workflow_dispatch or a protected environment gate',
    ciEligible: true,
    run(r) {
      const deploys = r
        .workflows()
        .map((f) => r.read(`.github/workflows/${f}`) ?? '')
        .filter((c) => /cdk deploy/.test(c))
      if (!deploys.length) return skip('no cdk deploy workflow')
      return deploys.every((c) => /workflow_dispatch|environment\s*:/.test(c))
        ? g('deploys gated (dispatch/environment)')
        : bad('yellow', 'cdk deploy runs ungated', 'gate deploys behind workflow_dispatch or a protected environment')
    },
  },
  {
    id: 'docs-trio',
    dimension: 'docs',
    kinds: [...APP_KINDS, 'workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'docs/overview.md, docs/architecture.md, docs/concepts.md and .claude/doc-sync/manifest.mjs',
    ciEligible: false, // advisory only — doc authoring needs judgment, CI must never block on it
    run(r) {
      // The trio lives at the repo root; monorepo children have no .git dir.
      if (!r.files('.git')) return skip('docs live at the repo root (monorepo child)')
      const trio = ['docs/overview.md', 'docs/architecture.md', 'docs/concepts.md']
      const missing = trio.filter((f) => !r.files(f))
      const manifest = r.files('.claude/doc-sync/manifest.mjs')
      if (missing.length === trio.length)
        return bad('red', 'no standardized docs (overview/architecture/concepts)', 'create the trio via /learn or /doc-onboard')
      if (missing.length)
        return bad('yellow', `missing: ${missing.join(', ')}`, 'complete the trio via /learn or /doc-onboard')
      if (!manifest)
        return bad('yellow', 'trio present but no doc-sync manifest', 'run /doc-onboard to add the manifest + registry entry')
      return g('trio + manifest present (freshness/drift via /learn audit)')
    },
  },
  {
    id: 'hub-links',
    dimension: 'hygiene',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: 'index.html links to every root-level report HTML file',
    ciEligible: true,
    run(r) {
      const hub = r.read('index.html')
      if (!hub) return bad('red', 'no index.html hub', 'create the hub page linking every report')
      const orphans = htmlPages(r)
        .filter((f) => f !== 'index.html' && f !== 'report-template.html')
        .filter((f) => {
          const clean = f.replace(/\.html$/, '')
          return !hub.includes(`"${clean}"`) && !hub.includes(`"${f}"`)
        })
      return orphans.length
        ? bad('red', `not linked from hub: ${orphans.join(', ')}`, 'add a card/link in index.html for each report')
        : g('every report linked from the hub')
    },
  },
  {
    id: 'self-contained',
    dimension: 'hygiene',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: 'root-level HTML script and link tags for external http or https asset URLs',
    ciEligible: true,
    run(r) {
      const offenders = htmlPages(r).filter((f) => {
        const html = r.read(f) ?? ''
        const tags = html.match(/<(?:script|link)\b[^>]*>/gi) ?? []
        return tags.some((t) => /(?:src|href)\s*=\s*["']https?:\/\//i.test(t))
      })
      return offenders.length
        ? bad('red', `external script/style in: ${offenders.join(', ')}`, 'inline everything — no CDNs; <a href> external links are fine')
        : g('all pages self-contained (no external script/style)')
    },
  },
  {
    id: 'noindex-meta',
    dimension: 'hygiene',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: 'root-level HTML files for a noindex meta tag',
    ciEligible: true,
    run(r) {
      const missing = htmlPages(r).filter((f) => !/<meta[^>]*noindex/i.test(r.read(f) ?? ''))
      return missing.length
        ? bad('red', `no noindex meta in: ${missing.join(', ')}`, 'add <meta name="robots" content="noindex, nofollow"> to every page')
        : g('every page carries noindex')
    },
  },
  {
    id: 'robots-disallow',
    dimension: 'deploy',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: 'robots.txt for a Disallow: / rule',
    ciEligible: true,
    run(r) {
      const robots = r.read('robots.txt')
      if (!robots) return bad('red', 'no robots.txt', 'add robots.txt with Disallow: /')
      return /^Disallow:\s*\/\s*$/m.test(robots)
        ? g('robots.txt disallows crawling')
        : bad('red', 'robots.txt does not disallow /', 'private reports: Disallow: /')
    },
  },
  {
    id: 'vercel-cleanurls',
    dimension: 'deploy',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: 'vercel.json cleanUrls set to true',
    ciEligible: true,
    run(r) {
      try {
        const cfg = JSON.parse(r.read('vercel.json') ?? 'null')
        return cfg?.cleanUrls === true
          ? g('cleanUrls on — /report resolves without .html')
          : bad('red', 'vercel.json missing cleanUrls: true', 'set {"cleanUrls": true}')
      } catch {
        return bad('red', 'vercel.json unreadable', 'commit a valid vercel.json with cleanUrls: true')
      }
    },
  },
  {
    id: 'gitignore-vercel',
    dimension: 'hygiene',
    kinds: ['static-site'],
    intents: PRODUCTION_ONLY,
    inspects: '.gitignore entries for the .vercel directory',
    ciEligible: true,
    run(r) {
      const gi = r.read('.gitignore') ?? ''
      return gi.split('\n').some((l) => l.trim() === '.vercel')
        ? g('.vercel gitignored')
        : bad('red', '.gitignore does not cover .vercel', 'add a .vercel line')
    },
  },
  {
    id: 'workspaces-field',
    dimension: 'hygiene',
    kinds: ['workspace'],
    intents: PRODUCTION_ONLY,
    inspects: "the root package.json private flag, and where workspace members are declared for the repo's package manager",
    ciEligible: true,
    run(r, ctx) {
      if (!r.pkg) return bad('red', 'no root package.json', 'add a private workspace root package.json')
      if (r.pkg.private !== true) return bad('red', 'root package.json is not private', 'set "private": true')
      const pm = ctx.effectivePackageManager
      const ws = r.pkg.workspaces
      const hasArray = Array.isArray(ws) && ws.length > 0
      // pnpm reads members from pnpm-workspace.yaml ONLY: it does not support
      // package.json "workspaces" and resolves nothing from it (it warns and moves on).
      // So under pnpm the array is not an alternative spelling of the same fact — a repo
      // that has only the array has told pnpm nothing, and must red.
      if (pm === 'pnpm') {
        if (r.files('pnpm-workspace.yaml')) return g('workspaces declared in pnpm-workspace.yaml')
        return hasArray
          ? bad('red', 'members declared only in package.json "workspaces", which pnpm ignores', 'declare members in pnpm-workspace.yaml')
          : bad('red', 'no workspaces field', 'declare members in pnpm-workspace.yaml')
      }
      if (hasArray) return g(`workspaces: ${ws.join(', ')}`)
      return bad('red', 'no workspaces field', 'declare "workspaces": ["packages/*", "apps/*"]')
    },
  },
  {
    id: 'tsconfig-base',
    dimension: 'hygiene',
    kinds: ['workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'tsconfig.base.json strict mode and member tsconfig.json extends declarations',
    ciEligible: true,
    run(r) {
      const base = r.read('tsconfig.base.json')
      if (!base) return bad('red', 'no tsconfig.base.json', 'add a strict base tsconfig that members extend')
      if (!/"strict"\s*:\s*true/.test(base))
        return bad('red', 'tsconfig.base.json is not strict', 'enable "strict": true in the base')
      const members = ['packages', 'apps', 'services', 'shared']
        .flatMap((dir) => r.list(dir).map((m) => `${dir}/${m}`))
        .filter((m) => r.files(`${m}/package.json`))
      if (!members.length) return skip('no workspace members found')
      const stray = members.filter((m) => {
        const t = r.read(`${m}/tsconfig.json`)
        return !t || !/"extends"\s*:\s*"[^"]*tsconfig.base/.test(t)
      })
      return stray.length
        ? bad('yellow', `not extending a tsconfig.base: ${stray.join(', ')}`, 'extend ../../tsconfig.base.json (expo apps: expo/tsconfig.base)')
        : g(`strict base + ${members.length} members extend it (${members.join(', ')})`)
    },
  },
  {
    id: 'root-task-trio',
    dimension: 'hygiene',
    kinds: ['workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'root package.json scripts named lint, typecheck and test',
    ciEligible: true,
    run(r) {
      const missing = ['lint', 'typecheck', 'test'].filter((s) => !r.pkg?.scripts?.[s])
      return missing.length
        ? bad('red', `missing root scripts: ${missing.join(', ')}`, 'root package.json owns lint/typecheck/test for the whole workspace')
        : g('root lint/typecheck/test scripts present')
    },
  },
  {
    id: 'root-vitest',
    dimension: 'testing',
    kinds: ['workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'the root vitest dependency and vitest.config.ts',
    ciEligible: true,
    run(r) {
      return r.deps.vitest && r.files('vitest.config.ts')
        ? g('root vitest config present')
        : bad('red', 'no root vitest wiring', 'add vitest + a root vitest.config.ts globbing packages/apps')
    },
  },
  {
    id: 'drizzle-in-package',
    dimension: 'db',
    kinds: ['workspace'],
    intents: PRODUCTION_ONLY,
    inspects: 'workspace member drizzle.config.ts files and their committed drizzle SQL migrations',
    ciEligible: true,
    run(r) {
      const owners = ['packages', 'apps', 'services', 'shared']
        .flatMap((dir) => r.list(dir).map((m) => `${dir}/${m}`))
        .filter((m) => r.files(`${m}/drizzle.config.ts`))
      if (!owners.length) return skip('no package owns a drizzle config')
      const dry = owners.filter((m) => !r.list(`${m}/drizzle`).some((f) => f.endsWith('.sql')))
      return dry.length
        ? bad('red', `drizzle config without committed migrations: ${dry.join(', ')}`, 'bunx drizzle-kit generate inside the package')
        : g(`db layer in ${owners.join(', ')} with migrations`)
    },
  },
  {
    id: 'vercel-schema',
    dimension: 'deploy',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'vercel.json parsed as JSON with the expected Vercel $schema URL',
    ciEligible: true,
    run(r) {
      const v = readVercelJson(r)
      if (v.kind === 'missing') return skip('no vercel.json (vercel-config owns that red)')
      if (v.kind === 'invalid')
        return bad('yellow', 'vercel.json is not valid JSON', 'fix the JSON — Vercel rejects an unparseable vercel.json')
      const schema = v.cfg.$schema
      if (typeof schema !== 'string')
        return bad('yellow', 'vercel.json has no $schema', `add "$schema": "${VERCEL_SCHEMA_URL}" so the editor validates the file`)
      return schema === VERCEL_SCHEMA_URL
        ? g('vercel.json declares the Vercel $schema')
        : bad('yellow', `unexpected $schema: ${schema}`, `use "${VERCEL_SCHEMA_URL}"`)
    },
  },
  {
    id: 'vercel-install-cmd',
    dimension: 'deploy',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: "vercel.json installCommand against the repo's declared package manager",
    ciEligible: true,
    run(r, ctx) {
      const pm = ctx.effectivePackageManager
      const v = readVercelJson(r)
      if (v.kind === 'missing') return skip('no vercel.json (vercel-config owns that red)')
      if (v.kind === 'invalid') return skip('vercel.json is not valid JSON (vercel-schema owns that)')
      const cmd = v.cfg.installCommand
      if (typeof cmd !== 'string')
        return bad('yellow', 'vercel.json declares no installCommand', `set "installCommand": "${pm} install --frozen-lockfile" — do not leave the manager to auto-detection`)
      // \b cannot match between the p and n of "pnpm" (both are word chars), so the npm
      // alternative never fires inside pnpm and the evidence names the real manager.
      // Match globally: a bare .match(/…/)?.[1] only reports the first hit by position,
      // which reads green whenever the declared manager happens to appear before a
      // foreign one later in the same command (e.g. "bun install && yarn build").
      const named = cmd.match(/\b(npm|yarn|pnpm|bun)\b/g) ?? []
      const foreign = named.find((m) => m !== pm)
      if (foreign)
        return bad('red', `installCommand uses ${foreign}, but ${pm} is declared: ${cmd}`, `${pm} only — "${pm} install --frozen-lockfile"`)
      if (/--production\b/.test(cmd))
        return bad('yellow', `installCommand passes --production: ${cmd}`, 'drop --production — it omits devDependencies, and next build type-checks against them')
      return g(`installCommand: ${cmd}`)
    },
  },
  {
    id: 'vercel-security-headers',
    dimension: 'deploy',
    kinds: ['next-app'],
    intents: PRODUCTION_ONLY,
    inspects: 'vercel.json, next.config.* and middleware files for five required security header names',
    ciEligible: true,
    run(r) {
      // An unparseable vercel.json must not contribute to the haystack: text-matching it
      // regardless of validity both double-reports the same cause vercel-schema already
      // flags (yellow here too, for the same broken file) AND — the sharper bug — a
      // broken file whose raw text still happens to list the five header names would
      // read green, a false negative on a file Vercel cannot actually apply.
      const vercelJson = readVercelJson(r)
      const sources = HEADER_SOURCES.filter((f) => f !== 'vercel.json' || vercelJson.kind === 'ok')
        .map((f) => ({ f, text: r.read(f) }))
        .filter((s): s is { f: (typeof HEADER_SOURCES)[number]; text: string } => s.text !== null)
      if (!sources.length)
        // Name the cause. Excluding an unparseable vercel.json leaves the source list empty,
        // and reporting that as "no vercel.json … to read" would be false — the file exists.
        // Same wording as vercel-install-cmd's invalid branch, so one broken file reads the
        // same way wherever it surfaces.
        return skip(
          vercelJson.kind === 'invalid'
            ? 'vercel.json is not valid JSON (vercel-schema owns that); no next.config.* or middleware either'
            : 'no vercel.json, next.config.* or middleware to read',
        )
      const where = sources.map((s) => s.f).join(', ')
      const haystack = sources
        .map((s) => (s.f.endsWith('.json') ? s.text : stripJsComments(s.text)))
        .join('\n')
        .toLowerCase()
      const missing = REQUIRED_SECURITY_HEADERS.filter((h) => !haystack.includes(h.toLowerCase()))
      return missing.length
        ? bad(
            'yellow',
            `security headers not set: ${missing.join(', ')} (looked in ${where})`,
            'set all five in vercel.json headers[] or a next.config headers() — no CSP, that stays per-app',
          )
        : g(`all five header names present in (${where})`)
    },
  },
  {
    id: 'aws-no-static-keys',
    dimension: 'deploy',
    kinds: ['cdk-service', 'lambda-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'every workflow file for static AWS access-key or secret-key value shapes',
    ciEligible: true,
    run(r) {
      if (!r.workflows().length) return skip('no workflows')
      const offenders = r
        .workflows()
        .filter((f) => STATIC_KEY.test(stripYamlComments(r.read(`.github/workflows/${f}`) ?? '')))
      return offenders.length
        ? bad(
            'red',
            `static AWS credentials in: ${offenders.join(', ')}`,
            'delete them, authenticate via OIDC (role-to-assume), and rotate the exposed keys — git history keeps them',
          )
        : g('no static AWS credentials in any workflow')
    },
  },
  {
    id: 'aws-oidc-auth',
    dimension: 'deploy',
    kinds: ['cdk-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'each workflow that runs cdk commands for id-token: write and role-to-assume',
    ciEligible: true,
    run(r) {
      // Per FILE, never against the concatenated wfContent(): OIDC in workflow A plus
      // `cdk deploy` in workflow B would otherwise pass having authenticated nothing (AUD-6).
      // Known limit: GitHub scopes `permissions:` and steps per JOB, so a two-job file where
      // only the non-deploying job assumes the role still passes. Per-job needs a real YAML
      // parser; per-file is already strictly stronger than concatenation.
      const cdkFiles = r
        .workflows()
        .map((f) => ({ f, c: stripYamlComments(r.read(`.github/workflows/${f}`) ?? '') }))
        .filter(({ c }) => /\bcdk\s+(?:deploy|diff|bootstrap)\b/.test(c))
      if (!cdkFiles.length) return skip('no workflow runs cdk deploy/diff/bootstrap')
      const unauthenticated = cdkFiles
        .filter(({ c }) => !(/id-token\s*:\s*write/.test(c) && /role-to-assume\s*:/.test(c)))
        .map(({ f }) => f)
      return unauthenticated.length
        ? bad(
            'red',
            `cdk runs without OIDC role assumption in: ${unauthenticated.join(', ')}`,
            'in the same file: permissions: id-token: write, plus aws-actions/configure-aws-credentials with role-to-assume',
          )
        : g(`OIDC role assumption in every cdk workflow (${cdkFiles.map(({ f }) => f).join(', ')})`)
    },
  },
  {
    id: 'aws-infra-lib',
    dimension: 'deploy',
    kinds: ['cdk-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'the CDK app package.json for a shared infra-cdk dependency pinned to a commit SHA',
    ciEligible: true,
    run(r) {
      const dir = findCdkDir(r)
      if (!dir) return bad('yellow', NO_CDK_APP, 'an aws-service should own a CDK app — scaffold one with /new-project')
      // The CDK app's OWN package.json owns the dependency. Only fall back to the repo
      // root's deps when the app directory has no package.json of its own.
      const own = jsonObject(r.read(under(dir, 'package.json')))
      const deps = own ? depsOf(own) : (r.deps as Record<string, unknown>)
      // TODO: this accepts ANY scope, so a typosquatted @attacker/infra-cdk pinned to a
      // SHA still reads green. Worth tightening to a specific owner/scope once the
      // library is published — SEC-11 (static keys via a compromised dep) is why this
      // check exists in the first place.
      const key = Object.keys(deps).find((k) => /(?:^|\/)infra-cdk$/.test(k))
      if (!key)
        return bad(
          'yellow',
          `${under(dir, 'package.json')} does not depend on the shared infra library`,
          'bun add github:<owner>/infra-cdk#<40-char-commit-sha> in the CDK app',
        )
      const spec = String(deps[key])
      return /#[0-9a-f]{40}\b/i.test(spec)
        ? g(`${key} pinned to a commit sha`)
        : bad(
            'yellow',
            `${key} is not pinned to a commit sha: ${spec}`,
            'pin the full 40-character commit sha — a tag or branch ref is force-movable, and cdk synth executes this library in a job holding deploy credentials',
          )
    },
  },
  {
    id: 'aws-governance-applied',
    dimension: 'deploy',
    kinds: ['cdk-service'],
    intents: PRODUCTION_ONLY,
    inspects: 'the CDK app entry file named by cdk.json for an applyGovernance call',
    ciEligible: true,
    run(r) {
      const dir = findCdkDir(r)
      if (!dir) return bad('yellow', NO_CDK_APP, 'an aws-service should own a CDK app — scaffold one with /new-project')
      const cdkJson = jsonObject(r.read(under(dir, 'cdk.json')))
      const app = typeof cdkJson?.app === 'string' ? cdkJson.app : null
      if (!app)
        return bad('yellow', `${under(dir, 'cdk.json')} has no "app" field`, 'set "app" to the CDK entry command, e.g. "bun run bin/app.ts"')
      // Parse the entry out of the command rather than assuming bin/app.ts: real repos run
      // "bun run bin/app.ts" and "bunx tsx bin/infra.ts".
      const entry = app.match(/(\S+\.(?:ts|js|mjs))(?:\s|$)/)?.[1]
      if (!entry)
        return bad('yellow', `no entry file in cdk.json app: ${app}`, 'point "app" at a .ts/.js entry file')
      const src = r.read(under(dir, entry))
      if (src === null)
        return bad('yellow', `cdk.json app points at ${under(dir, entry)}, which does not exist`, 'fix the "app" path')
      return /\bapplyGovernance\s*\(/.test(stripJsComments(src))
        ? g(`${under(dir, entry)} calls applyGovernance`)
        : bad(
            'yellow',
            `${under(dir, entry)} does not call applyGovernance`,
            'call applyGovernance(app, { service, owner, stage }) in the entry so tags + cdk-nag cover every stack',
          )
    },
  },
  {
    id: 'stack-declaration',
    dimension: 'ai',
    kinds: ANY_KIND,
    intents: ['production', 'sandbox'],
    inspects: 'stack.json at the repo root: presence, size, JSON validity, conformance to stack.schema.json, and whether git actually tracks it',
    ciEligible: true,
    run(_r, ctx) {
      const d = ctx.declaration
      if (d.state === 'missing')
        return bad('yellow', 'no stack.json', 'run /stack-declare — it writes the file from what was detected')
      if (d.state === 'too-large')
        return bad('yellow', `stack.json is ${d.bytes} bytes (max ${MAX_DECLARATION_BYTES})`, 'stack.json holds four fields; something else is in there')
      if (d.state === 'unparseable')
        return bad('yellow', `stack.json is not valid JSON: ${d.detail}`, 'fix the JSON, or rerun /stack-declare')
      if (d.state === 'invalid')
        return bad('yellow', truncate(`stack.json invalid: ${d.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`, 120), 'run /stack-declare to rewrite it')
      if (!d.tracked)
        return bad(
          'yellow',
          `stack.json declares ${d.declaration.kind} / ${d.declaration.intent} but is not committed`,
          'git add stack.json && commit it — an untracked declaration is invisible to a fresh clone and to CI',
        )
      return g(`stack.json declares ${d.declaration.kind} / ${d.declaration.intent}`)
    },
  },
  {
    id: 'kind-declared-matches',
    dimension: 'ai',
    kinds: ANY_KIND,
    intents: ['production', 'sandbox'],
    inspects: 'the kind field in stack.json compared against the kind detection resolved from the files',
    ciEligible: true,
    run(_r, ctx) {
      const d = ctx.declaration
      if (d.state !== 'ok') return skip('no valid declaration (stack-declaration owns that)')
      const declared = d.declaration.kind
      const detected = ctx.detection.kind
      if (d.declaration.pin)
        return bad('yellow', `pinned to ${d.declaration.pin.kind}: ${truncate(d.declaration.pin.reason, 120)} (detected ${detected})`, 'a pin is permanent and always reported — remove it once the repo is fixed')
      // `other` is confirmed BY nothing matching, so unknown is agreement, not a mismatch.
      if (declared === 'other')
        return detected === 'unknown'
          ? g(`acknowledged as other: ${truncate(d.declaration.reason ?? '', 120)}`)
          : bad('yellow', `declares other but detection found ${detected}`, `this repo grew a shape — set "kind": "${detected}"`)
      return declared === detected
        ? g(`declared ${declared}, detected ${detected}`)
        : bad('yellow', `declares ${declared}; detected ${detected} (${truncate(ctx.detection.evidence, 120)})`, `run /stack-declare — either fix the repo or set "kind": "${detected}"`)
    },
  },
  {
    id: 'kind-resolvable',
    dimension: 'ai',
    kinds: ANY_KIND,
    intents: ['production'],
    inspects: 'the result of evaluating all kind signatures: zero matches yields unknown, two or more yields ambiguous',
    // The only one of the three that can return red, so the only one that can
    // actually gate. The other two are CI-eligible so they RUN there and report;
    // yellow never enters ciRed.
    ciEligible: true,
    run(_r, ctx) {
      const d = ctx.declaration
      if (d.state === 'ok' && d.declaration.kind === 'other') return g('acknowledged as other')
      if (ctx.detection.kind === 'ambiguous')
        return bad('red', `two signatures matched: ${ctx.detection.matched.join(', ')}`, 'this is a classifier bug, not a repo problem — report it against kinds.ts; do NOT pin around it')
      if (ctx.detection.kind === 'unknown')
        return bad('yellow', 'no signature matched this repo', 'run /stack-declare — if the repo genuinely has no shape, declare "other" with a reason')
      return g(`resolved to ${ctx.detection.kind}`)
    },
  },
  {
    id: 'capabilities-declared-matches',
    dimension: 'hygiene',
    // Not SHAPED_KINDS: that table encodes directory conventions (conventions.ts),
    // and excludes lambda-service only because this standard has no reference repo
    // for its *directory* shape. detectCapabilities is a dependency/filename scan —
    // it needs no directory convention — and lambda-service is exactly the kind
    // whose idiomatic AWS SDK dependencies (SQS, SES, Secrets Manager, S3) map
    // straight onto queue/notifications/config-secrets/file-upload. Excluding it
    // would leave out the repos most likely to have capabilities worth auditing.
    kinds: [...APP_KINDS, 'package'],
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'detectCapabilities(r) against stack.json capabilities, in both directions',
    ciEligible: false,
    run(r, ctx) {
      const d = ctx.declaration
      if (d.state !== 'ok') return skip('no valid declaration (stack-declaration owns that)')
      const declared = d.declaration.capabilities ?? []
      const detected = detectCapabilities(r)

      const undeclared = detected.filter((c) => !declared.includes(c))
      // Confined to DETECTABLE: external-api has no dependency or filename that can ever
      // evidence it, so an undetected declaration of it is a legitimate human assertion,
      // not a stale claim — flagging it would create a finding that can never clear.
      const unevidenced = declared.filter((c) => DETECTABLE.includes(c) && !detected.includes(c))

      if (undeclared.length) {
        return bad(
          'red',
          `evidenced but undeclared: ${undeclared.join(', ')}`,
          'declare these in stack.json — until you do, every obligation they switch on is silently skipped',
        )
      }
      if (unevidenced.length) {
        return bad(
          'yellow',
          `declared but unevidenced: ${unevidenced.join(', ')}`,
          'either the capability was removed and the declaration went stale, or detection needs a new signal — say which',
        )
      }
      return g(declared.length ? `capabilities agree: ${declared.join(', ')}` : 'no capabilities detected or declared')
    },
  },
  {
    id: 'blueprint-naming',
    dimension: 'hygiene',
    // Same reasoning as capabilities-declared-matches just above: not SHAPED_KINDS. That
    // table encodes directory conventions this standard has a reference layout for; the
    // blueprint's name-pattern obligations apply to any node that can carry a ports/
    // use-cases/adapters/src tree at all, lambda-service included.
    kinds: [...APP_KINDS, 'package'],
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'TypeScript filenames (.ts/.tsx) under each automated name-pattern obligation scope, against that rule pattern',
    ciEligible: false,
    run(r, ctx) {
      // assessment === 'automated' only: the table also carries `manual` obligations with a
      // `.*` placeholder pattern ("reviewed, not checked"). That pattern matches every
      // filename, so including it here would not just be inert — it would count toward
      // "N naming obligations satisfied" for a judgment call no machine examined.
      const rules = obligationsFor(ctx.effectiveKind, ctx.effectiveCapabilities).filter(
        (o) => o.rule.type === 'name-pattern' && o.assessment === 'automated',
      )

      // Walked once and filtered per obligation below, rather than re-walking per
      // obligation — the same tree, sliced five different ways for the five scopes.
      const allFiles = r.listDeep('.')
      const violations: string[] = []
      const cited = new Set<string>()
      const exercised = new Set<string>()

      for (const o of rules) {
        if (o.rule.type !== 'name-pattern') continue
        // Every name-pattern obligation anchors on a TypeScript extension
        // (`\.tsx?$`, `\.port\.ts$`, `\.(adapter|repository)\.ts$`). A .css, .json or
        // .svg file inside the scope can therefore never satisfy one — reporting it as
        // a naming violation states a rename that would not fix anything, and inflates
        // the count with files the obligation does not govern. Filtering here rather
        // than in filesInScope keeps blueprint-construction and blueprint-layering,
        // which read file CONTENTS, seeing the whole tree.
        // This filter is hardcoded, not derived from `o.rule.pattern` — it holds only
        // because today's four automated name-pattern obligations all target TypeScript.
        // A future obligation targeting a non-TypeScript extension would be silently and
        // permanently excluded here; that is a limitation of this filter, not a fact
        // about naming obligations in general.
        const files = filesInScope(allFiles, o.rule.scope).filter((f) => /\.tsx?$/.test(f))
        if (!files.length) continue
        exercised.add(o.id)

        const re = new RegExp(o.rule.pattern)
        for (const f of files) {
          const base = f.split('/').pop() ?? f
          // Colocated tests are this stack's own sanctioned convention (member-has-tests'
          // hint says so explicitly): a test is named after the thing it tests, so it is
          // judged as that thing, not exempted outright — stripping the .test/.spec infix
          // keeps every obligation's reach, rather than switching all of them off at once.
          // A no-op on a non-test basename: stripTestInfix's replace() only fires on a match.
          if (!re.test(stripTestInfix(base))) {
            violations.push(f)
            cited.add(o.id)
          }
        }
      }

      if (!exercised.size) return skip('no blueprint-scoped directories present')
      if (!violations.length) return g(coverageMessage('naming', rules, exercised))

      const shown = violations.slice(0, 5).join(', ')
      const more = violations.length > 5 ? ` (+${violations.length - 5} more)` : ''
      return bad(
        'yellow',
        `${violations.length} file(s) off-pattern: ${shown}${more}`,
        `rename to match ${[...cited].join(', ')} — see docs/specs/2026-08-21-coding-conventions-ledger.md`,
      )
    },
  },
  {
    id: 'blueprint-construction',
    dimension: 'hygiene',
    // Same reasoning as blueprint-naming just above: not SHAPED_KINDS. The forbidden-syntax
    // obligations apply to any node that can carry a ports/src tree at all, lambda-service
    // included, not only the reference layout SHAPED_KINDS encodes.
    kinds: [...APP_KINDS, 'package'],
    intents: PRODUCTION_AND_SANDBOX,
    inspects:
      'file contents under each automated forbidden-syntax obligation scope, against that rule pattern, excluding its exceptPath',
    ciEligible: false,
    run(r, ctx) {
      // assessment === 'automated' only, mirroring blueprint-naming: the table also carries
      // manual obligations with placeholder rules that would otherwise inflate the satisfied
      // count for a judgment call no machine examined. This is what keeps
      // naming.ports-no-hungarian-prefix's sibling — construction.composition-root-lifetime,
      // manual, D7 — from ever producing a verdict here, even though both share a source.
      const rules = obligationsFor(ctx.effectiveKind, ctx.effectiveCapabilities).filter(
        (o) => o.rule.type === 'forbidden-syntax' && o.assessment === 'automated',
      )

      // Walked once and filtered per obligation below, exactly as blueprint-naming does:
      // filesInScope resolves `scope` as a depth-agnostic path SEGMENT, not a fixed top-level
      // directory, so a workspace member's packages/core/src still matches scope 'src', and
      // packages/core/src/ports still matches scope 'ports'.
      const allFiles = r.listDeep('.')
      const violations: string[] = []
      const cited = new Set<string>()
      const exercised = new Set<string>()

      for (const o of rules) {
        if (o.rule.type !== 'forbidden-syntax') continue
        const { scope, pattern, exceptPath, exceptTests } = o.rule
        // Every forbidden-syntax pattern in the table describes TypeScript source ('new
        // XAdapter(', 'export interface I...'). Scope 'src' can also hold files (markdown,
        // config) that can never carry this syntax; filtering them out here — before deciding
        // whether this obligation counts as exercised — is what keeps a scope populated only
        // by non-TypeScript files from being reported as examined when nothing in it was read.
        //
        // `exceptTests` filters in the same place, and for the same reason: an obligation that
        // does not govern tests, whose scope holds nothing but tests, was never exercised. Doing
        // it inside the per-file loop instead would leave it counted as satisfied.
        const files = filesInScope(allFiles, scope)
          .filter((f) => /\.tsx?$/.test(f))
          .filter((f) => !(exceptTests && isTestFile(f)))
        if (!files.length) continue
        exercised.add(o.id)

        const re = new RegExp(pattern)
        for (const f of files) {
          // '__never__' is the sentinel meaning no exception exists at all (carried by
          // naming.ports-no-hungarian-prefix). Checking it first is what stops a hypothetical
          // empty exceptPath from silently excepting every file — '' is a substring of every
          // string, so a bare `f.includes(exceptPath)` would disable the obligation entirely.
          // The table never sets exceptPath to '', but the guard is what keeps that failure
          // mode from being reachable by construction, not by convention.
          if (exceptPath !== '__never__' && f.includes(exceptPath)) continue
          const body = r.read(f)
          if (body && re.test(body)) {
            violations.push(f)
            cited.add(o.id)
          }
        }
      }

      if (!exercised.size) return skip('no blueprint-scoped directories present')
      if (!violations.length) return g(coverageMessage('construction', rules, exercised))

      const shown = violations.slice(0, 5).join(', ')
      const more = violations.length > 5 ? ` (+${violations.length - 5} more)` : ''
      return bad(
        'red',
        `forbidden syntax present in ${violations.length} file(s): ${shown}${more}`,
        `resolve per the cited obligation — ${[...cited].join(', ')}`,
      )
    },
  },
  {
    id: 'blueprint-layering',
    dimension: 'hygiene',
    // Same reasoning as blueprint-naming and blueprint-construction just above: not
    // SHAPED_KINDS. The layer-edge obligations apply to any node that can carry a
    // core/adapters tree at all, lambda-service included, not only the reference layout
    // SHAPED_KINDS encodes.
    //
    // S2a: this is the always-on floor for layering. The generated dependency-cruiser config
    // (depcruise.ts) is the deeper gate — it resolves module paths through @/* aliases and
    // sees the whole graph — but measurement showed it can silently cruise 0 modules and
    // exit 0 under this stack's declared TypeScript. This check has no such failure mode: it
    // never depends on an external compiler, so it always examines what it claims to.
    kinds: [...APP_KINDS, 'package'],
    intents: PRODUCTION_AND_SANDBOX,
    // The known miss (barrel laundering, computed dynamic specifiers) is stated in the green
    // evidence below, not here — EVIDENCE_MAX truncates inspects in CLI output (stack-audit.ts),
    // and stack-audit.test.ts asserts the full inspects string survives that truncation.
    inspects:
      "import/export/dynamic-import specifiers in files under each automated layer-edge obligation's `from` " +
      'scope, for a path segment matching its `to` scope',
    ciEligible: false,
    run(r, ctx) {
      // assessment === 'automated' only, mirroring blueprint-naming and blueprint-construction:
      // the table could carry a manual layer-edge obligation (none does today — see
      // __manual-layer-edge-fixture__ in blueprint.ts) and this filter is what keeps a
      // judgment call from ever producing an automated verdict.
      const rules = obligationsFor(ctx.effectiveKind, ctx.effectiveCapabilities).filter(
        (o) => o.rule.type === 'layer-edge' && o.assessment === 'automated',
      )

      // Walked once and filtered per obligation below, exactly as blueprint-naming and
      // blueprint-construction do: filesInScope resolves `from` as a depth-agnostic path
      // SEGMENT — 'core' matches a nested src/core/ (single-package layout) or, within a
      // workspace member that itself nests a layer directory (an app member's own
      // src/core/…), the same segment survives. r is already rooted at the member being
      // scored (stack-audit.ts rebases a member's facts to its own directory), so the
      // member's OWN name never appears in the paths this reads — only what is nested
      // inside it does. A workspace shaped as separate packages/core + packages/adapters
      // packages (no per-member nesting) is therefore outside this check's per-member reach;
      // the generated dependency-cruiser config runs from the workspace root and covers it.
      const allFiles = r.listDeep('.')
      const violations: string[] = []
      const cited = new Set<string>()
      const exercised = new Set<string>()

      for (const o of rules) {
        if (o.rule.type !== 'layer-edge') continue
        // exceptPath is deliberately ignored here, matching buildDepcruiseConfig (depcruise.ts),
        // which never reads it either. No live obligation sets it today; if one ever does, the
        // two surfaces must keep agreeing or they contradict each other (a file the generated
        // config permits but this check still flags, or vice versa) — ignoring it uniformly is
        // the stricter, safe-direction reading, and it costs nothing while the field is unused.
        const { from, to } = o.rule
        // Every layer-edge obligation describes a TypeScript import boundary; scope 'from'
        // can also hold non-TypeScript files (markdown, config) that can never carry an
        // import specifier. Filtering them out before deciding whether this obligation
        // counts as exercised — exactly the blueprint-construction ordering — is what keeps
        // a scope populated only by non-TypeScript files from being reported as examined
        // when nothing in it was read.
        const files = filesInScope(allFiles, from).filter((f) => /\.tsx?$/.test(f))
        if (!files.length) continue
        exercised.add(o.id)

        for (const f of files) {
          const body = r.read(f)
          if (body && importsSegment(body, to)) {
            violations.push(f)
            cited.add(o.id)
          }
        }
      }

      if (!exercised.size) return skip('no blueprint-scoped directories present')
      if (!violations.length) {
        return g(
          `${coverageMessage('layering', rules, exercised)} — string match only; barrel-laundered ` +
            're-exports and computed dynamic imports are not traced',
        )
      }

      const shown = violations.slice(0, 5).join(', ')
      const more = violations.length > 5 ? ` (+${violations.length - 5} more)` : ''
      return bad(
        'red',
        `forbidden import present in ${violations.length} file(s): ${shown}${more}`,
        `resolve per the cited obligation — ${[...cited].join(', ')} — barrel re-exports and computed dynamic ` +
          'imports need the generated dependency-cruiser config, not this check',
      )
    },
  },
  {
    id: 'blueprint-depcruise-current',
    dimension: 'hygiene',
    // Same reasoning as blueprint-naming, blueprint-construction, and blueprint-layering just
    // above: not SHAPED_KINDS. That table (conventions.ts) is Object.keys() over the
    // directory-SHAPE table — files/dirs/routerAnyOf a kind is expected to have at its own
    // root — and its exclusions are justified on those directory-convention grounds, which do
    // not transfer here. buildDepcruiseConfig's PREFIX table (depcruise.ts) is a generic
    // layer-name-to-path mapping (core/adapters/app, by workspace-vs-single shape) that does
    // not depend on conventions.ts's Shape table at all, so it applies equally to
    // lambda-service, which SHAPED_KINDS excludes — and lambda-service is exactly the kind
    // whose dependencies make layering interesting.
    // ...plus 'workspace', unlike its three siblings. The other three inspect FILE CONTENT under
    // each member's own tree, so running them at the root would apply the root's kind and
    // capabilities to every member's files. This one inspects a single ROOT ARTIFACT that only
    // ever exists at the root, whose sole layer-edge obligation is UNIVERSAL and therefore
    // kind- and capability-independent — so the objection that keeps the siblings member-scoped
    // does not apply. Paired with CHILD_EXCLUDED_IDS above, this runs exactly once per repo, over
    // the tree where the artifact lives.
    kinds: [...APP_KINDS, 'package', 'workspace'],
    intents: PRODUCTION_AND_SANDBOX,
    inspects:
      '.dependency-cruiser.json against freshly generated content, the devDependencies it needs, and whether ' +
      "the declared typescript range falls inside dependency-cruiser's own supported range",
    ciEligible: false,
    run(r, ctx) {
      // S2a: this is the deeper gate, not the floor. blueprint-layering above is the
      // always-on floor and never depends on an external compiler; this check verifies the
      // generated config itself, which does — and the task's own name says the order to check
      // in: present, then current, then effective.
      if (!('dependency-cruiser' in r.deps)) {
        // Never a bare 'typescript' — that resolves to 7.x today, which dependency-cruiser
        // cannot load a compiler for (S2a/S2b), the exact failure this whole check exists to
        // catch. Matches new-project/SKILL.md's own install instruction (Ruling AK).
        return bad(
          'red',
          'dependency-cruiser is not a devDependency',
          'bun add -d dependency-cruiser typescript@npm:@typescript/typescript6',
        )
      }

      const found = r.read('.dependency-cruiser.json')
      if (!found) {
        return bad('red', '.dependency-cruiser.json missing', REGENERATE_HINT)
      }

      const expected = expectedDepcruiseConfig(r, ctx)

      // Compare parsed structure, not bytes. The repo's own formatter will reformat this
      // file on first touch, and a byte comparison would report drift on every run — the
      // same reasoning that gives vendor-drift.ts its `formatting` escape hatch. S12 is why
      // this file is .dependency-cruiser.json rather than the tool's own .js default: only
      // the .json extension reaches that escape hatch at all.
      let current: unknown
      try {
        current = JSON.parse(found)
      } catch {
        return bad('red', '.dependency-cruiser.json is not valid JSON', REGENERATE_HINT)
      }
      if (JSON.stringify(current) !== JSON.stringify(JSON.parse(expected))) {
        return bad(
          'red',
          '.dependency-cruiser.json has drifted from the blueprint table',
          `${REGENERATE_HINT} — a local edit here silently weakens enforcement for this repo only`,
        )
      }

      // S2b: present and current both hold, but a byte-perfect config enforces nothing if
      // dependency-cruiser cannot load a compiler for it. Measured (docs/context/research/
      // dependency-cruiser.md): typescript@7.0.2 cruises 0 modules and exits 0 against a
      // deliberate core -> adapters import — a clean exit from an examination that never
      // happened. This is the state the whole S2 amendment exists to catch, so it is never
      // allowed to fall through to green uncaught.
      const declaredTs = r.deps.typescript
      if (declaredTs === undefined) {
        return bad(
          'red',
          'config present but enforcement ineffective — no typescript dependency is declared',
          `dependency-cruiser needs a typescript install in its supported range (${DC_TYPESCRIPT_RANGE}) — add one`,
        )
      }

      const tsStatus = typescriptRangeStatus(declaredTs)
      if (tsStatus === 'out-of-range') {
        return bad(
          'red',
          `config present but enforcement ineffective — typescript is pinned to '${declaredTs}', outside ` +
            `dependency-cruiser's supported range (${DC_TYPESCRIPT_RANGE})`,
          'pin typescript below 7, or wait for dependency-cruiser to ship TypeScript 7 support — until then ' +
            'the cruise silently examines nothing and still exits 0',
        )
      }
      if (tsStatus === 'unknown') {
        return bad(
          'yellow',
          `cannot verify effectiveness — typescript's declared range '${declaredTs}' does not match a ` +
            'recognized shape (caret, tilde, x-range, exact pin, or a two-sided >= < range)',
          `confirm by hand that the installed typescript satisfies dependency-cruiser's supported range ` +
            `(${DC_TYPESCRIPT_RANGE})`,
        )
      }

      return g(".dependency-cruiser.json matches the blueprint table and typescript is in dependency-cruiser's supported range")
    },
  },
  {
    id: 'compose-name',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'the top-level `name` key of every compose file in the repo',
    ciEligible: true,
    run(r) {
      const files = composeFiles(r)
      if (!files.length) return g('no compose file')
      const unnamed: string[] = []
      const broken: string[] = []
      for (const file of files) {
        const doc = composeObject(r.read(file))
        if (!doc) {
          broken.push(file)
          continue
        }
        if (typeof doc.name !== 'string' || !doc.name.trim()) unnamed.push(file)
      }
      if (broken.length)
        return bad('red', `unparseable compose: ${broken.join(', ')}`, 'fix the YAML')
      if (unnamed.length)
        return bad(
          'red',
          `no top-level name: ${unnamed.join(', ')}`,
          'add `name: <repo>` — without it the project name comes from the directory, so renaming the folder orphans the volumes',
        )
      return g(`name pinned in ${files.length} compose file(s)`)
    },
  },
  {
    id: 'compose-db-loopback',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'published ports of compose services whose image is a database or queue',
    ciEligible: true,
    run(r) {
      const offenders: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        for (const [name, service] of Object.entries(composeServices(doc))) {
          const image = typeof service.image === 'string' ? service.image : ''
          if (!DB_IMAGE_RE.test(image)) continue
          for (const port of publishedPorts(service)) {
            // Two colons means an IP is present. One means host:container with
            // no IP, which publishes on every interface. `[::1]` is the
            // bracketed IPv6 loopback form Compose requires — genuinely bound,
            // not a LAN-reachable publish.
            if (
              !port.includes('127.0.0.1:') &&
              !port.startsWith('localhost:') &&
              !port.includes('[::1]:')
            ) {
              offenders.push(`${file}:${name} (${port})`)
            }
          }
        }
      }
      if (offenders.length)
        return bad(
          'red',
          `db ports not bound to loopback: ${offenders.join(', ')}`,
          "publish as '127.0.0.1:PORT:PORT' — Docker's DNAT is processed before ufw's INPUT chain, so an unbound port is LAN-reachable regardless of firewall rules",
        )
      return g('db ports bound to loopback')
    },
  },
  {
    id: 'compose-image-pinned',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'the image tag of every compose service that declares one',
    ciEligible: true,
    run(r) {
      const offenders: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        for (const [name, service] of Object.entries(composeServices(doc))) {
          const image = service.image
          if (typeof image !== 'string' || !image) continue
          // No separate `@sha256:` guard: for a digest reference (`postgres@sha256:abc…`)
          // the split below already lands on the digest hex as a non-empty, non-`latest`
          // "tag" (`postgres@sha256:abc` → lastSegment `postgres@sha256:abc` → `abc`), so a
          // digest pin is never flagged with or without one. Verified with a digest-pinned
          // fixture (`checks-compose.test.ts`, "accepts a digest pin") passing identically
          // with the guard present and absent.
          // Split on the LAST colon after the last slash: a registry host may
          // carry a port (`registry:5000/app:1.2`), which is not a tag.
          const lastSegment = image.slice(image.lastIndexOf('/') + 1)
          const tag = lastSegment.includes(':') ? lastSegment.slice(lastSegment.indexOf(':') + 1) : ''
          if (!tag || tag === 'latest') offenders.push(`${file}:${name} (${image})`)
        }
      }
      if (offenders.length)
        return bad(
          'red',
          `unpinned images: ${offenders.join(', ')}`,
          'pin a concrete version tag — :latest lets a release silently migrate your database on the next pull',
        )
      return g('all images pinned')
    },
  },
  {
    id: 'compose-env-tracked',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether any git-tracked non-example file is referenced by an env_file entry',
    ciEligible: true,
    run(r) {
      const tracked = new Set(r.tracked())
      const offenders: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
        for (const service of Object.values(composeServices(doc))) {
          for (const envPath of envFilePaths(service, dir)) {
            // .env.example is meant to be committed — that is its purpose. Match
            // the exact filename, the same convention env-example/env-gitignore
            // use, so .env.example.local or secrets.example aren't waved through.
            if (envPath.split('/').pop() === '.env.example') continue
            if (tracked.has(envPath)) offenders.push(envPath)
          }
        }
      }
      if (offenders.length)
        return bad(
          'red',
          `committed env files reach containers: ${[...new Set(offenders)].join(', ')}`,
          'gitignore them and commit a .env.example instead — a live third-party credential in a compose-referenced env file is a real exposure',
        )
      return g('no committed env files referenced')
    },
  },
  {
    id: 'compose-profile-deps',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether every depends_on target can be active whenever its dependent is',
    ciEligible: true,
    run(r) {
      const offenders: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const services = composeServices(doc)
        for (const [name, service] of Object.entries(services)) {
          const mine = profilesOf(service)
          for (const { name: target, required } of dependsOnNames(service)) {
            if (!required) continue
            const dep = services[target]
            if (!dep) continue // a missing service is compose's error, not ours
            const theirs = profilesOf(dep)
            // Always-on target: satisfiable from anywhere.
            if (!theirs.length) continue
            // Unprofiled dependent needs an always-on target, which this is not.
            if (!mine.length) {
              offenders.push(`${name} → ${target}`)
              continue
            }
            // Both profiled: the target must be active in every profile that
            // can activate the dependent, so mine must be a subset of theirs.
            if (!mine.every((p) => theirs.includes(p))) offenders.push(`${name} → ${target}`)
          }
        }
      }
      if (offenders.length)
        return bad(
          'red',
          `depends_on targets that may be inactive: ${offenders.join(', ')}`,
          'a service may only depend on one active whenever it is — move the target out of its profile, widen the profile, or mark the dependency required: false',
        )
      return g('every depends_on target is always reachable')
    },
  },
  {
    id: 'compose-healthcheck',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether every long-running compose service defines a healthcheck',
    ciEligible: true,
    run(r) {
      const missing: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const services = composeServices(doc)
        for (const [name, service] of Object.entries(services)) {
          if (!isLongRunning(name, service, services)) continue
          if (service.healthcheck === undefined) missing.push(`${file}:${name}`)
        }
      }
      if (missing.length)
        return bad(
          'yellow',
          `no healthcheck: ${missing.join(', ')}`,
          "add one — probe a cheap endpoint with redirect:'manual' and require r.ok, so a 5xx marks it unhealthy instead of any response marking it healthy",
        )
      return g('every long-running service has a healthcheck')
    },
  },
  {
    id: 'compose-depends-healthy',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether depends_on on a healthchecked service waits for service_healthy',
    ciEligible: true,
    run(r) {
      const weak: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const services = composeServices(doc)
        for (const [name, service] of Object.entries(services)) {
          const dep = service.depends_on
          const bare = Array.isArray(dep) ? dep.filter((d): d is string => typeof d === 'string') : []
          for (const target of bare) {
            if (services[target]?.healthcheck !== undefined) weak.push(`${name} → ${target}`)
          }
          if (dep !== null && typeof dep === 'object' && !Array.isArray(dep)) {
            for (const [target, body] of Object.entries(dep as Record<string, unknown>)) {
              if (services[target]?.healthcheck === undefined) continue
              const condition =
                body !== null && typeof body === 'object' && !Array.isArray(body)
                  ? (body as Record<string, unknown>).condition
                  : undefined
              if (condition !== 'service_healthy' && condition !== 'service_completed_successfully')
                weak.push(`${name} → ${target}`)
            }
          }
        }
      }
      if (weak.length)
        return bad(
          'yellow',
          `depends_on without service_healthy: ${weak.join(', ')}`,
          'use `condition: service_healthy` — the bare form only waits for the container to start, which races a cold database on first boot',
        )
      return g('depends_on waits for health where health is defined')
    },
  },
  /**
   * Resolution reads `build.context`, falling back to `working_dir` — both path
   * fields, by design (see the commit that added this check). A service is
   * therefore unresolvable, and stays silent, whenever app identity lives in
   * neither. One pnpm monorepo in this portfolio is the concrete case: its
   * compose runs `docker compose -f docker/docker-compose.yml --project-directory .`,
   * so `context: .` is legitimately the repo root — that part of the compose file
   * is correct — and each service instead selects its app via
   * `command: pnpm --filter <scope>/web`. `build.context` cannot see into
   * `command`, even in principle, so this check cannot tell that repo's `web`
   * (Next 15) from a hypothetical sibling on Next 16. Known and accepted: the
   * strategy stays on those two path fields rather than growing a second,
   * command-parsing path.
   *
   * Note the `working_dir` fallback is close to inert in practice: it is a path
   * inside the container (`/app`), not a host path, so it rarely matches a
   * manifest. It is kept because it costs nothing and occasionally names a real
   * subdirectory; it should not be mistaken for a second resolution strategy.
   */
  {
    id: 'compose-dead-polling',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'WATCHPACK_POLLING against the Next version of the app each service builds',
    ciEligible: true,
    run(r) {
      const manifests = r.listDeep('.').filter((f) => f.endsWith('package.json'))
      const dead: string[] = []
      for (const file of composeFiles(r)) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
        for (const [name, service] of Object.entries(composeServices(doc))) {
          const env = service.environment
          const hasPolling =
            (env !== null && typeof env === 'object' && !Array.isArray(env) &&
              'WATCHPACK_POLLING' in (env as Record<string, unknown>)) ||
            (Array.isArray(env) &&
              env.some(
                (e) => typeof e === 'string' && (e === 'WATCHPACK_POLLING' || e.startsWith('WATCHPACK_POLLING=')),
              ))
          if (!hasPolling) continue

          // Resolve the service to its app: build.context, else working_dir.
          const build = service.build
          let context: string | null = null
          if (typeof build === 'string') context = build
          else if (build !== null && typeof build === 'object' && !Array.isArray(build)) {
            const c = (build as Record<string, unknown>).context
            if (typeof c === 'string') context = c
          }
          if (context === null && typeof service.working_dir === 'string') context = service.working_dir
          if (context === null) continue // unresolvable: stay silent

          const appDir = (dir === '.' ? context : `${dir}/${context}`)
            .replace(/^\.\//, '')
            .replace(/\/\.$/, '')
            .replace(/^\.$/, '')
          // Nearest package.json at or above the app directory.
          const candidates = manifests
            .filter((m) => {
              const mDir = m.includes('/') ? m.slice(0, m.lastIndexOf('/')) : ''
              return appDir === mDir || appDir.startsWith(`${mDir}/`) || mDir === ''
            })
            .sort((a, b) => b.length - a.length)
          const nearest = candidates[0]
          if (!nearest) continue
          const pkg = jsonObject(r.read(nearest))
          const deps = pkg?.dependencies
          const declared =
            deps !== null && typeof deps === 'object' && !Array.isArray(deps)
              ? (deps as Record<string, unknown>).next
              : undefined
          if (typeof declared !== 'string') continue
          if (nextMajorAtLeast16(declared)) dead.push(`${file}:${name}`)
        }
      }
      if (dead.length)
        return bad(
          'yellow',
          `WATCHPACK_POLLING is dead config: ${dead.join(', ')}`,
          'remove it — it is a webpack-only variable and Turbopack is the default dev bundler from Next 16; on native Linux Docker Engine inotify crosses bind mounts without polling anyway',
        )
      return g('no dead polling config')
    },
  },
  {
    id: 'compose-duplicate-service',
    dimension: 'hygiene',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether two compose files define services building the same application directory',
    ciEligible: true,
    run(r) {
      const files = composeFiles(r)
      if (files.length < 2) return g(`${files.length} compose file(s)`)
      const byTarget = new Map<string, string[]>()
      for (const file of files) {
        const doc = composeObject(r.read(file))
        if (!doc) continue
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
        for (const [name, service] of Object.entries(composeServices(doc))) {
          const build = service.build
          let context: string | null = null
          if (typeof build === 'string') context = build
          else if (build !== null && typeof build === 'object' && !Array.isArray(build)) {
            const c = (build as Record<string, unknown>).context
            if (typeof c === 'string') context = c
          }
          if (context === null) continue
          const resolved = normalizeRelPath(dir === '.' ? context : `${dir}/${context}`)
          if (resolved === null) continue
          const key = resolved === '' ? 'ROOT' : resolved
          byTarget.set(key, [...(byTarget.get(key) ?? []), `${file}:${name}`])
        }
      }
      const dupes = [...byTarget.entries()].filter(
        ([, sites]) => new Set(sites.map((s) => s.slice(0, s.lastIndexOf(':')))).size > 1,
      )
      if (dupes.length)
        return bad(
          'yellow',
          dupes.map(([target, sites]) => `${target} defined by ${sites.join(' and ')}`).join('; '),
          'reconcile them — two definitions of one app drift, and which one you get depends on your working directory',
        )
      return g('no duplicate service definitions')
    },
  },
  {
    id: 'member-readme',
    dimension: 'docs',
    kinds: SHAPED_KINDS,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'the files named in shapeFor(effectiveKind).files at the node root',
    ciEligible: true,
    run(r, ctx) {
      const shape = shapeFor(ctx.effectiveKind)
      const missing = shape.files.filter((f) => !r.files(f))
      if (!missing.length) return g(`${shape.files.join(', ')} present`)
      return bad(
        'yellow',
        `missing ${missing.join(', ')}`,
        'a README here is the first thing someone opening this directory reads — write one that describes what lives here',
      )
    },
  },
  {
    id: 'shape-required-dirs',
    dimension: 'hygiene',
    kinds: SHAPED_KINDS,
    intents: PRODUCTION_AND_SANDBOX,
    inspects:
      'shapeFor(effectiveKind).dirs and .routerAnyOf; for cdk-service, dirs resolve against cdkDir(r), not the node root',
    ciEligible: true,
    run(r, ctx) {
      const shape = shapeFor(ctx.effectiveKind)
      // cdk-service's bin/lib live wherever cdk.json does (`.`, `infra/` or `cdk/`), not
      // necessarily at the node root — a real service repo here keeps both under cdk/. Asserting
      // absence of bin/lib at the node root when they exist one level down under the
      // real CDK app is a false statement, not merely an unhelpful one.
      const cdkBase = ctx.effectiveKind === 'cdk-service' ? cdkDir(r) : null
      const dirs = shape.dirs.map((d) => (cdkBase ? under(cdkBase, d) : d))
      const missing = dirs.filter((d) => !r.files(d))
      const routerMissing =
        shape.routerAnyOf.length > 0 && !shape.routerAnyOf.some((d) => r.files(d))
      if (!missing.length && !routerMissing) {
        const parts = [
          shape.routerAnyOf.length ? 'router present' : null,
          dirs.length ? `${dirs.join(', ')} present` : null,
        ].filter((p): p is string => p !== null)
        return g(parts.length ? parts.join(', ') : 'no required directories for this kind')
      }
      const parts = [
        ...missing.map((d) => `no ${d}/`),
        ...(routerMissing ? [`no router (${shape.routerAnyOf.map((d) => `${d}/`).join(' or ')})`] : []),
      ]
      return bad(
        'yellow',
        parts.join('; '),
        'match the layout this standard defines for this kind — see docs/specs/2026-08-15-structure-naming-conventions-design.md',
      )
    },
  },
  {
    id: 'member-has-tests',
    dimension: 'testing',
    kinds: SHAPED_KINDS,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'every path below the node for a .test. or .spec. file, at any depth and in any directory',
    ciEligible: true,
    run(r) {
      const tests = r.listDeep('.').filter((f) => TEST_FILE_RE.test(f))
      if (tests.length) return g(`${tests.length} test file(s)`)
      return bad(
        'yellow',
        'no test files anywhere below this member',
        'this member has no tests in any location — a .test. or .spec. file, in tests/, test/ or colocated, is accepted, so this is absence rather than layout',
      )
    },
  },
  {
    id: 'package-entrypoint',
    dimension: 'hygiene',
    kinds: SHAPED_KINDS,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'package.json exports, for members whose path begins with packages/',
    ciEligible: true,
    run(r) {
      // Libraries live under packages/; applications live under apps/ and are entered by
      // running them, not by being imported. `private` cannot separate the two — in real
      // repos here, an apps/api, a packages/core and a scoped @<scope>/db are all private:true.
      // filter(Boolean) drops the trailing empty segment a `/`-terminated path leaves —
      // without it, 'packages/mylib/'.split('/') puts 'mylib' at length-2, not 'packages',
      // and a directory the shell tab-completed a slash onto reads as a non-library.
      const segments = r.root.split('/').filter(Boolean)
      const isLibrary = segments[segments.length - 2] === 'packages'
      if (!isLibrary) return g('not a library under packages/')
      if (r.pkg?.exports !== undefined) return g('exports declared')
      return bad(
        'yellow',
        r.pkg?.main !== undefined ? 'declares main but not exports' : 'declares neither exports nor main',
        'add an exports field — without it Vitest needs vite-tsconfig-paths, a second sibling consumer must duplicate the tsconfig alias, and subpath encapsulation is lost',
      )
    },
  },
  {
    id: 'shape-committed-junk',
    dimension: 'hygiene',
    kinds: SHAPED_KINDS,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'tracked() for any path segment matching shapeFor(effectiveKind).forbidden',
    ciEligible: true,
    run(r, ctx) {
      // Segment equality, never substring: `coverage.md` and `distribution/` must not match.
      // Anchoring needs no extra work — tracked() is already scoped to the node's own
      // directory (facts.ts:171 runs git ls-files with the node root as cwd).
      const forbidden = new Set(shapeFor(ctx.effectiveKind).forbidden)
      const hits = r.tracked().filter((p) => p.split('/').some((seg) => forbidden.has(seg)))
      if (!hits.length)
        return g(r.gitOk ? 'no committed build output' : 'not a git repo — committed files not verifiable')
      const names = [...new Set(hits.flatMap((p) => p.split('/').filter((s) => forbidden.has(s))))]
      const severe = names.some((n) => JUNK_RED.has(n))
      return bad(
        severe ? 'red' : 'yellow',
        `${names.map((n) => `${n}/`).join(', ')} committed (${hits.length} file(s))`,
        'remove from git and add to .gitignore. Exception: a Node-based GitHub Action (action.yml with runs.using node20/node24) must commit dist/, because Actions run checked-in JavaScript with no build step',
      )
    },
  },
  {
    id: 'local-env-path',
    dimension: 'docs',
    kinds: ANY_KIND,
    intents: PRODUCTION_AND_SANDBOX,
    inspects: 'whether a repo needing a stateful service documents a compose stack or a Neon branch path',
    ciEligible: true,
    run(r) {
      if (composeFiles(r).length) return g('compose stack present')
      const examples = r.listDeep('.').filter((f) => f.endsWith('.example'))
      const needsState = examples.some((f) => (r.read(f) ?? '').includes('DATABASE_URL'))
      if (!needsState) return g('no stateful dependency')
      const prose = [r.read('README.md'), r.read('CLAUDE.md')].filter(Boolean).join('\n').toLowerCase()
      if (prose.includes('neon')) return g('Neon branch path documented')
      return bad(
        'yellow',
        'needs a database but documents no way to get one',
        'document the Neon branch step in README.md, or add a compose stack — a newcomer currently cannot run this',
      )
    },
  },
]
