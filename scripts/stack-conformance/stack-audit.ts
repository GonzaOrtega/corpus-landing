import path from 'node:path'
import { CAPABILITIES, detectCapabilities } from './capabilities'
import { readDeclaration, type DeclarationResult, type PackageManager } from './declaration'
import { buildFacts, type RepoFacts } from './facts'
import { detectKind, workspaceMembers, type Detection, type Intent, type Kind } from './kinds'
import { sanitizeForTerminal, truncate } from './sanitize'
import {
  applicableChecks,
  CHECKS,
  CHILD_EXCLUDED_IDS,
  type ClassificationContext,
  type Dimension,
  STANDARD_VERSION,
  type Status,
} from './standard'

export { buildFacts, type RepoFacts }

export interface DimensionScore {
  dimension: Dimension
  status: Status
  results: Array<{ id: string; status: Status; evidence: string; hint?: string; inspects: string }>
}

export interface RepoReport {
  repo: string
  kind: Kind
  intent: Intent
  detection: Detection
  declaration: DeclarationResult
  pinned: boolean
  acknowledged: boolean
  dimensions: DimensionScore[]
  standard: boolean
  ciRed: string[]
  apps?: RepoReport[]
}

interface AuditOptions {
  ci?: boolean
  isMember?: boolean
  inheritedIntent?: Intent
  inheritedPackageManager?: PackageManager
}

const WORST: Status[] = ['red', 'yellow', 'green', 'skip']
const worse = (a: Status, b: Status): Status => (WORST.indexOf(a) < WORST.indexOf(b) ? a : b)

export interface Classification extends ClassificationContext {
  pinned: boolean
  acknowledged: boolean
  intent: Intent
}

/**
 * How a repo is graded: which kind, which intent, which capabilities. Extracted so the audit and
 * `scripts/regenerate-depcruise.ts` cannot drift apart on it — a generator that resolved the kind
 * or the capability union even slightly differently from the checker would emit a config the
 * checker then reports as permanent drift, on a repo that did exactly what the hint said.
 */
export function classify(
  facts: RepoFacts,
  inheritedIntent?: Intent,
  inheritedPackageManager?: PackageManager,
): Classification {
  const detection = detectKind(facts)
  const declaration = readDeclaration(facts)
  const decl = declaration.state === 'ok' ? declaration.declaration : null

  const pinned = !!decl?.pin
  const kind: Kind = decl?.pin?.kind ?? detection.kind
  const acknowledged = decl?.kind === 'other' && detection.kind === 'unknown'
  const effectiveKind: Kind = acknowledged ? 'other' : kind
  const intent: Intent = decl?.intent ?? inheritedIntent ?? 'production'

  const declaredCaps = decl?.capabilities ?? []
  const effectiveCapabilities = CAPABILITIES.filter(
    (c) => detectCapabilities(facts).includes(c) || declaredCaps.includes(c),
  )

  const effectivePackageManager: PackageManager =
    inheritedPackageManager ??
    (decl?.packageManager ?? 'bun')

  return {
    detection,
    declaration,
    pinned,
    acknowledged,
    effectiveKind,
    intent,
    effectiveCapabilities,
    effectivePackageManager,
  }
}

export function auditRepo(root: string, opts: AuditOptions = {}): RepoReport {
  return auditRepoAt(root, opts)
}

function auditRepoAt(
  root: string,
  opts: AuditOptions,
  parentFacts?: RepoFacts,
  repo = path.basename(path.resolve(root)),
): RepoReport {
  const ownFacts = buildFacts(root, { isMember: opts.isMember ?? false })
  const facts = parentFacts && opts.isMember ? inheritWorkflows(ownFacts, parentFacts) : ownFacts
  const {
    detection,
    declaration,
    pinned,
    acknowledged,
    effectiveKind,
    intent,
    effectiveCapabilities,
    effectivePackageManager,
  } = classify(facts, opts.inheritedIntent, opts.inheritedPackageManager)

  const checks = applicableChecks(effectiveKind, intent, { ci: opts.ci })
    .filter((check) => !opts.isMember || !CHILD_EXCLUDED_IDS.has(check.id))
  const { dimensions, standard, ciRed } = score(facts, checks, {
    detection,
    declaration,
    effectiveKind,
    effectiveCapabilities,
    effectivePackageManager,
  })

  const base: RepoReport = {
    repo,
    kind: effectiveKind,
    intent,
    detection,
    declaration,
    pinned,
    acknowledged,
    dimensions,
    standard: standard && !pinned && !acknowledged,
    ciRed,
  }

  if (effectiveKind !== 'workspace') return base

  const apps = workspaceMembers(facts).map((member) =>
    auditRepoAt(
      path.join(root, member),
      { ...opts, isMember: true, inheritedIntent: intent, inheritedPackageManager: effectivePackageManager },
      facts,
      opts.isMember ? path.join(repo, member) : member,
    ),
  )
  return {
    ...base,
    apps,
    standard: base.standard && apps.every((app) => app.standard),
    ciRed: [...ciRed, ...apps.flatMap((app) => app.ciRed)],
  }
}

function inheritWorkflows(childFacts: RepoFacts, parentFacts: RepoFacts): RepoFacts {
  const inherit = () => !childFacts.workflows().length
  return {
    ...childFacts,
    workflows: () => (inherit() ? parentFacts.workflows() : childFacts.workflows()),
    wfContent: () => (inherit() ? parentFacts.wfContent() : childFacts.wfContent()),
    read: (rel) =>
      childFacts.read(rel) ??
      (rel.startsWith('.github/workflows/') && inherit() ? parentFacts.read(rel) : null),
  }
}

function score(facts: RepoFacts, checks: typeof CHECKS, ctx: ClassificationContext) {
  const byDim = new Map<Dimension, DimensionScore>()
  const ciRed: string[] = []
  for (const check of checks) {
    const result = check.run(facts, ctx)
    const dim = byDim.get(check.dimension) ?? {
      dimension: check.dimension,
      status: 'skip' as Status,
      results: [],
    }
    dim.results.push({ id: check.id, inspects: check.inspects, ...result })
    dim.status = dim.results.reduce<Status>((acc, scored) => worse(acc, scored.status), 'skip')
    byDim.set(check.dimension, dim)
    if (check.ciEligible && result.status === 'red') ciRed.push(check.id)
  }
  const dimensions = [...byDim.values()]
  const standard = dimensions.every((dimension) =>
    dimension.results.every((result) => result.status === 'green' || result.status === 'skip'),
  )
  return { dimensions, standard, ciRed }
}

const EVIDENCE_MAX = 200

export function formatReport(r: RepoReport, opts: { verbose: boolean; ci?: boolean }, indent = ''): string {
  const lines: string[] = []
  const label = r.pinned ? 'PINNED' : r.acknowledged ? 'ACKNOWLEDGED' : r.standard ? 'STANDARD' : 'NOT STANDARD'
  const repo = truncate(r.repo, EVIDENCE_MAX)
  lines.push(`${indent}${repo} [${r.kind} / ${r.intent}] — ${label} (v${STANDARD_VERSION})`)

  for (const d of r.dimensions) {
    const results = opts.ci ? d.results.filter((c) => c.status === 'red') : d.results
    if (opts.ci && results.length === 0) continue
    lines.push(`${indent}  ${d.dimension}: ${d.status}`)
    for (const c of results) {
      if (!opts.ci && !opts.verbose && c.status === 'green') continue
      lines.push(`${indent}    [${c.status}] ${c.id} — ${truncate(c.evidence, EVIDENCE_MAX)}${c.hint ? ` → ${truncate(c.hint, EVIDENCE_MAX)}` : ''}`)
      if (!opts.ci && opts.verbose) lines.push(`${indent}        looked at: ${truncate(c.inspects, EVIDENCE_MAX)}`)
    }
  }
  for (const app of r.apps ?? []) lines.push(formatReport(app, opts, `${indent}  `))

  if (opts.verbose && !opts.ci && !indent) {
    const all = r.dimensions.flatMap((d) => d.results)
    const counts = (s: string): number => all.filter((x) => x.status === s).length
    lines.push('')
    lines.push(`CONCLUSION — ${repo}`)
    lines.push(`  kind    ${r.kind.padEnd(14)} ${truncate(r.detection.evidence, EVIDENCE_MAX)}`)
    if (r.detection.matched.length <= 1) lines.push(`${' '.repeat(26)}(no other signature fired)`)
    else lines.push(`${' '.repeat(26)}matched signatures: ${truncate(r.detection.matched.join(' + '), EVIDENCE_MAX)}`)
    lines.push(`  intent  ${r.intent.padEnd(14)} ${r.declaration.state === 'ok' ? 'from stack.json' : `no valid stack.json (${r.declaration.state})`}`)
    lines.push(`  ran     ${all.length} checks · ${counts('skip')} skipped`)
    lines.push(`  verdict ${label} — ${counts('red')} red, ${counts('yellow')} yellow`)
    if (!r.standard) lines.push('           → /stack-declare to declare or override, or fix the findings above')
  }
  return sanitizeForTerminal(lines.join('\n'))
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((arg) => arg.startsWith('--')))
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const root = positional[0] ?? '.'
  const report = auditRepo(root, { ci: flags.has('--ci') })
  if (flags.has('--json')) console.log(JSON.stringify(report, null, 2))
  else console.log(formatReport(report, { verbose: !flags.has('--ci') && !flags.has('--json'), ci: flags.has('--ci') }))
  if (flags.has('--ci') && report.ciRed.length) {
    console.error(`CONFORMANCE FAILED — red: ${report.ciRed.join(', ')}`)
    process.exit(1)
  }
}
