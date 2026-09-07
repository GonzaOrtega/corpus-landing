import type { Capability } from './capabilities'
import type { Kind } from './kinds'

export type Rule =
  /** `from` may not import `to`. Emitted as a dependency-cruiser forbidden rule. */
  | { type: 'layer-edge'; from: string; to: string; exceptPath?: string }
  /** Files matching `scope` must match `pattern`; those that do not are findings. */
  | { type: 'name-pattern'; scope: string; pattern: string; describe: string }
  /**
   * `pattern` must not appear in files under `scope`, except in `exceptPath`.
   *
   * `exceptTests` names a second, orthogonal exemption: `exceptPath` is the one sanctioned
   * LOCATION for the syntax, while `exceptTests` says the obligation does not govern test
   * files at all. Opt-in, because absence must keep meaning "tests are in scope" — that is
   * the current behaviour of every other obligation, and a rule that silently stopped reading
   * tests would be the same shape of defect as a check that never runs.
   */
  | {
      type: 'forbidden-syntax'
      scope: string
      pattern: string
      exceptPath: string
      exceptTests?: true
    }
  /** These paths must exist, relative to the node root. */
  | { type: 'required-path'; paths: string[] }
  /** These paths must not exist. */
  | { type: 'forbidden-path'; paths: string[] }

export interface Obligation {
  /** Cited by doctrine and by generated config comments. Stable across releases. */
  id: string
  /** Automated checks confirm a control's shape; manual ones confirm its correctness. */
  assessment: 'automated' | 'manual'
  /** Flows into the dependency-cruiser `comment` field and the rendered docs. */
  rationale: string
  /** The ratified ledger ruling this implements. */
  source: string
  rule: Rule
}

export class ContradictionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContradictionError'
  }
}

/**
 * Applies to every shaped node regardless of kind or capability.
 */
export const UNIVERSAL: Obligation[] = [
  {
    id: 'layering.core-no-adapters',
    assessment: 'automated',
    source: 'R3',
    rationale:
      'core declares ports; adapters implement them. An import in this direction inverts the dependency arrow and puts a technology choice inside the layer that exists to be free of them.',
    rule: { type: 'layer-edge', from: 'core', to: 'adapters' },
  },
  {
    id: 'naming.ports-no-hungarian-prefix',
    assessment: 'automated',
    source: 'R1',
    rationale:
      'A port is named for the capability it describes, not for the fact that it is an interface. The I prefix restates the type system and says nothing about what the port is for.',
    // This targets an identifier inside file content ("exported interface names ... must
    // not begin with I"), not a filename — so it is forbidden-syntax, not name-pattern.
    // A name-pattern reading of this rule can only ever inspect the filename, and every
    // filename in this portfolio is already kebab-case (D9), so the pattern would pass
    // unconditionally on every repo while still counting as an enforced obligation.
    // No legitimate exception exists for an I-prefixed port interface. The sentinel
    // '__never__' carries that meaning in the value itself: the consumer's contract
    // (Task 8) skips a file only when exceptPath !== '__never__' AND the path matches it,
    // so this sentinel — which can never occur in a real path — never skips anything.
    // exceptPath: '' would NOT mean "no exception": every real path includes the empty
    // string, so the consumer would skip every file and the obligation would never fire —
    // reintroducing, by a different route, the exact bug this obligation was converted to fix.
    rule: {
      type: 'forbidden-syntax',
      scope: 'ports',
      pattern: 'export\\s+interface\\s+I[A-Z]',
      exceptPath: '__never__',
    },
  },
  {
    id: 'naming.port-file-suffix',
    assessment: 'automated',
    source: 'D5',
    rationale:
      'The .port.ts suffix makes ports greppable and makes the inner-layer rule checkable in one line: every *.port.ts must live under core/.',
    rule: {
      type: 'name-pattern',
      scope: 'ports',
      pattern: '^[a-z0-9-]+\\.port\\.ts$',
      describe: 'port files are kebab-case with a .port.ts suffix',
    },
  },
  {
    id: 'naming.use-case-file-suffix',
    assessment: 'automated',
    source: 'D4',
    rationale:
      'service means four different things in this portfolio at once — a use case, an entity manager, a deployable, and a cloud product. use-case collides with none of them and states the unit size.',
    rule: {
      type: 'name-pattern',
      scope: 'use-cases',
      pattern: '^[a-z0-9-]+\\.use-case\\.ts$',
      describe: 'use case files are kebab-case with a .use-case.ts suffix',
    },
  },
  {
    id: 'naming.files-are-kebab-case',
    assessment: 'automated',
    source: 'D9',
    rationale:
      'A single casing rule means a filename is predictable without knowing what the file contains. Mixed casing also breaks on case-insensitive filesystems, once, badly.',
    rule: {
      type: 'name-pattern',
      scope: 'src',
      pattern: '^[a-z0-9][a-z0-9.-]*\\.tsx?$',
      describe: 'source filenames are kebab-case',
    },
  },
  {
    id: 'construction.adapters-only-in-capabilities',
    assessment: 'automated',
    source: 'D7',
    rationale:
      'Constructing an adapter anywhere else hides a technology choice inside business logic and makes it unswappable. One directory owns construction so the wiring is readable in one place.',
    // A test that writes `new InMemoryItemRepository()` is not hiding a technology choice
    // inside business logic — it is exercising the port the obligation exists to protect.
    // Applied to tests, the rule inverts its own rationale: the only way to satisfy it is to
    // move test doubles into composition/capabilities/, i.e. to put fake adapters in the
    // production composition root. This surfaced during the portfolio migration: two of one
    // service's three findings were an in-memory repository constructed in a unit test, and
    // the pre-implementation survey had assumed an exemption the table did not carry.
    rule: {
      type: 'forbidden-syntax',
      scope: 'src',
      pattern: 'new\\s+\\w+(Adapter|Repository)\\s*\\(',
      exceptPath: 'composition/capabilities/',
      exceptTests: true,
    },
  },
  {
    id: 'construction.use-cases-only-in-wiring',
    assessment: 'automated',
    source: 'D7',
    rationale:
      'Wiring a use case outside a wiring file scatters the dependency graph. Keeping it in one file per feature means each feature declares what it needs at its own boundary.',
    // Same reasoning as its sibling above: a test constructing the use case under test is the
    // narrowest possible dependency graph, not a scattered one.
    rule: {
      type: 'forbidden-syntax',
      scope: 'src',
      pattern: 'new\\s+\\w+UseCase\\s*\\(',
      exceptPath: '.wiring.ts',
      exceptTests: true,
    },
  },
  {
    id: 'construction.composition-root-lifetime',
    assessment: 'manual',
    source: 'D7',
    rationale:
      'Where an instance is constructed is checkable; how long it lives is not. A connection pool reused across warm invocations is correct; anything holding request state is a cross-request leak that looks identical from the outside.',
    rule: { type: 'required-path', paths: ['src/composition'] },
  },
  {
    id: 'design.one-use-case-per-file',
    assessment: 'manual',
    source: 'D2',
    rationale:
      'A use case is finished when its one job works. A service named after a noun has no such limit, which is where god objects come from.',
    rule: { type: 'name-pattern', scope: 'use-cases', pattern: '.*', describe: 'reviewed, not checked' },
  },
  {
    id: 'design.dependencies-are-injected',
    assessment: 'manual',
    source: 'R3',
    rationale:
      'A unit that imports its own adapter cannot be tested without that adapter, and cannot be reused against a different one. Injection is what makes the port boundary real rather than decorative.',
    rule: { type: 'name-pattern', scope: 'use-cases', pattern: '.*', describe: 'reviewed, not checked' },
  },
  {
    id: 'layering.ports-declared-in-core',
    assessment: 'automated',
    source: 'R4',
    rationale:
      'A port declared beside its implementation is not a port — it is a header file. Declaring it in the inner layer is what lets the inner layer stay ignorant of the outer one.',
    rule: { type: 'required-path', paths: ['core/src/ports'] },
  },
  {
    id: 'naming.adapters-technology-prefixed',
    assessment: 'automated',
    source: 'D8',
    rationale:
      'An in-memory repository beside a Drizzle one tells you instantly which a test is wired to. A capability-named adapter hides the very thing you swap.',
    rule: {
      type: 'name-pattern',
      scope: 'adapters',
      pattern: '^[a-z0-9-]+\\.(adapter|repository)\\.ts$',
      describe: 'adapter files are kebab-case, technology-first, with an .adapter.ts or .repository.ts suffix',
    },
  },
]

export const BY_KIND: Partial<Record<Kind, Obligation[]>> = {}

export const BY_CAPABILITY: Partial<Record<Capability, Obligation[]>> = {
  persistence: [
    {
      id: 'persistence.repositories-return-entities',
      assessment: 'manual',
      source: 'D6',
      rationale:
        'A repository returning a database row leaks the schema into every caller. Mapping at the boundary is why the core can be read without knowing what a table looks like.',
      rule: { type: 'required-path', paths: ['core/src/mappers'] },
    },
  ],
}

/**
 * A required path that another obligation forbids is a rule no repo can satisfy. With one
 * axis this was unreachable; with two it is not, and it fails silently — the repo simply
 * never goes green and nobody can say why. JSON Schema's `allOf` has the same hole. This
 * is a bug in the table, not a precedence question, so it throws rather than resolving.
 *
 * Scope: this only checks `required-path` against `forbidden-path` on the same path. A
 * `name-pattern` pair could express the same kind of unsatisfiable demand — two obligations
 * requiring mutually exclusive patterns over overlapping scope — and nothing here catches
 * that shape. Widening the check is out of scope for now; this comment exists so that gap
 * is a known limit, not an assumption a future reader has to discover the hard way.
 */
function assertNoContradiction(obligations: Obligation[]): void {
  const requiredBy = new Map<string, Obligation>()
  const forbiddenBy = new Map<string, Obligation>()

  for (const o of obligations) {
    if (o.rule.type === 'required-path') for (const p of o.rule.paths) requiredBy.set(p, o)
    if (o.rule.type === 'forbidden-path') for (const p of o.rule.paths) forbiddenBy.set(p, o)
  }

  for (const [path, requiredByObligation] of requiredBy) {
    const forbiddenByObligation = forbiddenBy.get(path)
    if (!forbiddenByObligation) continue
    throw new ContradictionError(
      `unsatisfiable obligations: '${path}' is required by '${requiredByObligation.id}' ` +
        `(source ${requiredByObligation.source}) and forbidden by '${forbiddenByObligation.id}' ` +
        `(source ${forbiddenByObligation.source})`,
    )
  }
}

/**
 * Additive, exactly as `mergeShape` is. A capability adds requirements; it never removes a
 * universal one. Removing a universal rule is deliberately not expressible — if that need
 * arises it is a signal the rule was never universal.
 *
 * Capabilities are folded in the order the caller supplies them; the sort by id below is
 * what makes the result order-independent, not the fold order itself.
 */
export function obligationsFor(kind: Kind, caps: Capability[]): Obligation[] {
  const collected: Obligation[] = [...UNIVERSAL, ...(BY_KIND[kind] ?? [])]

  for (const cap of caps) collected.push(...(BY_CAPABILITY[cap] ?? []))

  const byId = new Map<string, Obligation>()
  for (const o of collected) if (!byId.has(o.id)) byId.set(o.id, o)

  const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  assertNoContradiction(merged)
  return merged
}

/**
 * Not a real kind. Exists so the contradiction guard has something to catch in tests —
 * every real entry in this table is, by construction, non-contradictory, which would
 * otherwise leave the guard untested until the day it was needed.
 */
BY_KIND['__contradiction-fixture__' as Kind] = [
  {
    id: 'fixture.requires-x', assessment: 'automated', source: 'D0',
    rationale: 'test fixture', rule: { type: 'required-path', paths: ['x'] },
  },
  {
    id: 'fixture.forbids-x', assessment: 'automated', source: 'D0',
    rationale: 'test fixture', rule: { type: 'forbidden-path', paths: ['x'] },
  },
]

/**
 * Not a real kind, same reasoning as __contradiction-fixture__ above. blueprint-construction
 * (standard.ts) only lets `assessment: 'automated'` obligations produce a verdict — but no
 * live forbidden-syntax obligation is manual today (construction.composition-root-lifetime
 * is manual, but its rule is required-path, already excluded by the rule.type filter alone).
 * Without a real one to exercise the assessment filter against, that guard would go untested
 * until the day a manual forbidden-syntax obligation actually entered the table.
 */
BY_KIND['__manual-forbidden-syntax-fixture__' as Kind] = [
  {
    id: 'fixture.manual-forbidden-syntax', assessment: 'manual', source: 'D0',
    rationale: 'test fixture', rule: { type: 'forbidden-syntax', scope: 'src', pattern: '.*', exceptPath: '__never__' },
  },
]

/**
 * Not a real kind, same reasoning as __manual-forbidden-syntax-fixture__ above.
 * blueprint-layering (standard.ts) only lets `assessment: 'automated'` layer-edge
 * obligations produce a verdict — but the live table's only layer-edge obligation,
 * layering.core-no-adapters, is automated. Without a manual one to exercise the assessment
 * filter, that guard would go untested until the day a manual layer-edge obligation actually
 * entered the table. `from`/`to` are deliberately 'x'/'y' — disjoint from the real
 * 'core'/'adapters' pair — so a test fixture that trips this rule cannot be mistaken for the
 * real obligation catching it by coincidence.
 */
BY_KIND['__manual-layer-edge-fixture__' as Kind] = [
  {
    id: 'fixture.manual-layer-edge', assessment: 'manual', source: 'D0',
    rationale: 'test fixture', rule: { type: 'layer-edge', from: 'x', to: 'y' },
  },
]
