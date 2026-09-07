import type { Obligation } from './blueprint'

export type RepoShape = 'workspace' | 'single'

/**
 * Where each layer lives, by repo shape. A workspace packages the layers; a single-package
 * repo nests them under src/. The obligations are identical either way — only the prefix
 * differs — which is why the table stores layer names and this function stores paths.
 */
const PREFIX: Record<RepoShape, Record<string, string>> = {
  workspace: { core: '^packages/core/', adapters: '^packages/adapters/', app: '^apps/[^/]+/src/' },
  single: { core: '^src/core/', adapters: '^src/adapters/', app: '^src/' },
}

/**
 * Only `layer-edge` obligations become dependency-cruiser rules. The construction
 * obligations look similar but are not import-boundary rules at all: a use case lives in
 * core, which every layer may already import, so the constraint is about which *file*
 * calls the constructor. dependency-cruiser has no concept of a call site. Those stay with
 * the grep check, exactly as the spec's enforcement matrix routes them.
 */
export function buildDepcruiseConfig(obligations: Obligation[], shape: RepoShape): string {
  const p = PREFIX[shape]

  const forbidden = obligations
    .filter((o) => o.rule.type === 'layer-edge')
    .map((o) => {
      if (o.rule.type !== 'layer-edge') throw new Error('unreachable')
      return {
        name: o.id,
        // Omitting severity defaults it to warn, which does not affect the exit code —
        // a rule that cannot fail the build is decorative.
        severity: 'error',
        comment: o.rationale,
        from: { path: p[o.rule.from] ?? `^${o.rule.from}/` },
        to: { path: p[o.rule.to] ?? `^${o.rule.to}/` },
      }
    })

  const config = {
    // GENERATED — regenerate with the stack-audit blueprint generator rather than editing.
    forbidden,
    options: {
      tsPreCompilationDeps: false,
      doNotFollow: { path: 'node_modules' },
    },
  }

  return `${JSON.stringify(config, null, 2)}\n`
}

/**
 * dependency-cruiser@18.2.0's own published compiler-support floor (S2b). Not configurable by
 * us — the tool resolves `typescript` with a hardcoded `import("typescript")` and checks the
 * resolved version against this exact range, falling back silently to a JS-only parser (which
 * drops every file carrying real TypeScript syntax) when nothing in range resolves. See
 * docs/context/research/dependency-cruiser.md for the measurement this range and its failure
 * mode are drawn from.
 */
export const DC_TYPESCRIPT_RANGE = '>=2.0.0 <7.0.0'

const DC_CEILING: [number, number, number] = [7, 0, 0]

const cmpTriple = (a: [number, number, number], b: [number, number, number]): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * True when a range whose top edge is `ceiling` (inclusive or exclusive, per `inclusive`)
 * permits some version at or above dependency-cruiser's unsupported floor, 7.0.0. This is the
 * only comparison `typescriptRangeStatus` needs: every shape it parses is reduced to "what is
 * the highest version this range can resolve to," because a lower bound below 7 can never by
 * itself make a range unsupported — only the ceiling can reach into the unsupported zone.
 */
const reachesUnsupported = (ceiling: [number, number, number], inclusive: boolean): boolean =>
  inclusive ? cmpTriple(ceiling, DC_CEILING) >= 0 : cmpTriple(ceiling, DC_CEILING) > 0

const num = (s: string | undefined, fallback: number): number => (s === undefined ? fallback : Number(s))

/**
 * Ruling AJ (2026-08-22). `@typescript/typescript6` is TypeScript's own sanctioned interim
 * republish of the last JS-based compiler under a scoped name, precisely so it can be aliased
 * to `typescript` (`typescript@npm:@typescript/typescript6`, the install new-project/SKILL.md
 * recommends per S2a) without colliding with the real `typescript@7` package. The package name
 * alone fixes the major version at 6 — every version this package has ever published or ever
 * will is inside dependency-cruiser's supported range — so this is an IDENTITY check on one
 * specific package, not a version parser: it matches with or without a trailing resolved
 * version after `@` (bun records the resolved range there once installed) and never inspects
 * what that trailing text says. This must stay narrow: an `npm:` alias to any OTHER package
 * carries no such guarantee and must keep falling through to 'unknown' below, the same as
 * before this branch existed.
 */
const TYPESCRIPT6_ALIAS = /^npm:@typescript\/typescript6(?:@.*)?$/

/**
 * Whether the declared `typescript` range (a package.json version specifier, e.g. `^7.0.2`)
 * can resolve to a version dependency-cruiser cannot load a compiler for. A STATIC read of the
 * range string, never a resolved install — the vendored engine has zero runtime dependencies
 * and cannot npm/bun-resolve an actual tree (S1), so this can only reason about what the range
 * text permits, not about what is actually on disk.
 *
 * Handles the declaration shapes this portfolio's package.json files actually use:
 * - the sanctioned `npm:@typescript/typescript6` alias (see TYPESCRIPT6_ALIAS) — always 'ok',
 *   by package identity rather than by parsing a version
 * - caret (`^7`, `^7.0`, `^7.0.2`) — ceiling is the next major, exclusive
 * - tilde (`~5`, `~5.9`, `~5.9.2`) — ceiling is the next minor, exclusive, UNLESS only a major
 *   is given, in which case tilde behaves like caret (npm's own tilde semantics)
 * - x-ranges and bare partial versions (`5`, `5.x`, `5.9`, `5.9.x`) — same ceiling rule as
 *   caret/tilde, because a missing or wildcarded component means "any value here"
 * - a bare exact version (`5.9.2`, three concrete components, no operator) — an exact pin,
 *   ceiling is that version itself, inclusive
 * - a two-sided comparator range (`>=5 <7`, `>=5.0.0 <=6.9.9`) — ceiling comes from the `<`/`<=`
 *   side; the `>`/`>=` side is read but not needed, because only the ceiling can push a range
 *   into the unsupported zone (see reachesUnsupported)
 *
 * Everything else — OR ranges (`||`), hyphen ranges (`1.2.3 - 2.3.4`), a single unbounded
 * comparator (`>=5` with no cap), dist-tags (`latest`, `next`), workspace/catalog protocols
 * (`workspace:*`, `catalog:`), any other npm alias, prerelease tags — returns `'unknown'`. An
 * unparseable range must never read as `'ok'`: the caller's job is to report that honestly,
 * not to guess green.
 */
export function typescriptRangeStatus(range: string): 'ok' | 'out-of-range' | 'unknown' {
  const trimmed = range.trim()

  if (TYPESCRIPT6_ALIAS.test(trimmed)) return 'ok'

  const caret = /^\^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(trimmed)
  if (caret) {
    const major = num(caret[1], 0)
    return reachesUnsupported([major + 1, 0, 0], false) ? 'out-of-range' : 'ok'
  }

  const tilde = /^~\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(trimmed)
  if (tilde) {
    const major = num(tilde[1], 0)
    const ceiling: [number, number, number] =
      tilde[2] === undefined ? [major + 1, 0, 0] : [major, num(tilde[2], 0) + 1, 0]
    return reachesUnsupported(ceiling, false) ? 'out-of-range' : 'ok'
  }

  const xRange = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(trimmed)
  if (xRange) {
    const major = num(xRange[1], 0)
    const minorIsWild = xRange[2] === undefined || /[xX*]/.test(xRange[2])
    const patchIsWild = xRange[3] === undefined || /[xX*]/.test(xRange[3])
    if (minorIsWild) return reachesUnsupported([major + 1, 0, 0], false) ? 'out-of-range' : 'ok'
    const minor = num(xRange[2], 0)
    if (patchIsWild) return reachesUnsupported([major, minor + 1, 0], false) ? 'out-of-range' : 'ok'
    // All three components are concrete digits — an exact pin, inclusive.
    const patch = num(xRange[3], 0)
    return reachesUnsupported([major, minor, patch], true) ? 'out-of-range' : 'ok'
  }

  const pair = /^>(=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s+<(=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(trimmed)
  if (pair) {
    // Groups: 1 = lower '=' flag, 2..4 = lower major/minor/patch (read but unused — only the
    // ceiling can push a range into the unsupported zone, per reachesUnsupported's own doc
    // comment), 5 = upper '=' flag, 6..8 = upper major/minor/patch. Off-by-one here previously
    // read `inclusive` from the lower bound's patch slot and the ceiling one slot early, which
    // made the verdict depend only on which operator (`<` vs `<=`) was used, never on the
    // version — every strict `<` case decayed to ceiling [0,0,0] ('ok' always), every `<=` case
    // decayed to `Number('=')` (`NaN`, 'out-of-range' always). Caught by a reviewer's spread of
    // cases this file's own tests never exercised.
    const inclusive = pair[5] === '='
    const ceiling: [number, number, number] = [num(pair[6], 0), num(pair[7], 0), num(pair[8], 0)]
    return reachesUnsupported(ceiling, inclusive) ? 'out-of-range' : 'ok'
  }

  return 'unknown'
}
