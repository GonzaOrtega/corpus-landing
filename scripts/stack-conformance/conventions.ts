import type { Kind } from './kinds'

/**
 * The structural conventions the reference repo in this portfolio establishes, as data rather than as check logic.
 *
 * Read forward by sub-project 3's generator ("create these directories") and backward
 * by sub-project 4's migration ("this repo is missing these"). That is why it is a
 * table and not twenty-four imperative run() closures — a closure answers yes/no and
 * discards the shape it was checking against.
 */
export interface Shape {
  /** Required at the node root. */
  files: string[]
  /** Required directories, relative to the node root. */
  dirs: string[]
  /** Satisfied when ANY listed path exists. Empty means no router requirement. */
  routerAnyOf: string[]
  /** Must not appear as a path segment in tracked(). */
  forbidden: string[]
}

const UNIVERSAL: Shape = {
  files: ['README.md'],
  dirs: [],
  routerAnyOf: [],
  forbidden: ['dist', '.next', '.turbo', 'coverage', 'test-results', 'node_modules'],
}

/**
 * `workspace` is deliberately absent: it is the only kind that recurses into members
 * (stack-audit.ts:86), so shaping it would run every convention check on the node that
 * also runs them on each child. Kinds the reference repo does not demonstrate — docs-repo, cli,
 * lambda-service, other — are absent because this standard does not invent conventions
 * it has no reference for.
 *
 * `app.json`, `cdk.json` and `next.config.*` are absent because they are framework-
 * mandated: an Expo app without app.json does not run, so the check could never fire.
 * This table encodes what the reference repo CHOSE, not what the framework already enforces.
 */
const BY_KIND: Partial<Record<Kind, Partial<Shape>>> = {
  package: { dirs: ['src'] },
  'expo-app': { routerAnyOf: ['app', 'src/app'] },
  'next-app': { routerAnyOf: ['app', 'src/app'] },
  'cdk-service': { dirs: ['bin', 'lib'] },
}

export const SHAPED_KINDS = Object.keys(BY_KIND) as Kind[]

/**
 * Exported for testing: the additive merge is a load-bearing invariant that
 * shapeFor alone cannot exercise, because no BY_KIND entry overrides a
 * non-empty universal field today.
 */
export const mergeShape = (base: Shape, over: Partial<Shape>): Shape => ({
  files: [...base.files, ...(over.files ?? [])],
  dirs: [...base.dirs, ...(over.dirs ?? [])],
  routerAnyOf: [...base.routerAnyOf, ...(over.routerAnyOf ?? [])],
  forbidden: [...base.forbidden, ...(over.forbidden ?? [])],
})

/**
 * Per-kind entries are ADDITIVE. Every array field concatenates onto the universal one
 * rather than replacing it — a spread (`{ ...UNIVERSAL, ...BY_KIND[kind] }`) would let a
 * kind that sets `files` silently drop the universal README.md. No kind overrides `files`
 * or `forbidden` today; this exists so the first one that does cannot introduce that bug.
 *
 * Removing a universal rule is deliberately not expressible. If that need arises it is a
 * signal the rule was never universal.
 */
export const shapeFor = (kind: Kind): Shape => mergeShape(UNIVERSAL, BY_KIND[kind] ?? {})
