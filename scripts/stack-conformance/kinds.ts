import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { RepoFacts } from './facts'

export type Kind =
  | 'next-app' | 'expo-app' | 'workspace' | 'package' | 'cli'
  | 'cdk-service' | 'lambda-service' | 'cdk-library'
  | 'static-site' | 'docs-repo' | 'toolkit'
  | 'other' | 'unknown' | 'ambiguous'

export type Intent = 'production' | 'sandbox' | 'exempt'

export interface KindDef {
  id: Kind
  memberOnly?: boolean
  /** What this signature reads. Printed at runtime, not merely commented. */
  inspects: string
  matches(r: RepoFacts): boolean
  evidence(r: RepoFacts): string
}

export interface Detection {
  kind: Kind
  evidence: string
  matched: Kind[]
}

type Pkg = {
  workspaces?: unknown
  main?: unknown
  exports?: unknown
  bin?: string | Record<string, string>
  name?: string
} | null

const pkgOf = (r: RepoFacts): Pkg => r.pkg as Pkg

const workspacePackages = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  if (!value || typeof value !== 'object' || !('packages' in value)) return []
  const packages = value.packages
  return Array.isArray(packages) ? packages.filter((entry): entry is string => typeof entry === 'string') : []
}

export function workspaceGlobs(r: RepoFacts): string[] {
  const fromPackage = workspacePackages(pkgOf(r)?.workspaces)
  if (fromPackage.length) return fromPackage
  const yaml = r.read('pnpm-workspace.yaml')
  if (!yaml) return []
  return [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map((m) => m[1]!.trim())
}

const WORKSPACE_SKIP = new Set(['.git', 'node_modules'])
const workspaceDirs = (r: RepoFacts, rel: string): string[] => {
  try {
    return readdirSync(path.join(r.root, rel), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !WORKSPACE_SKIP.has(entry.name))
      .map((entry) => entry.name)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
}
const hasWorkspacePackage = (r: RepoFacts, rel: string): boolean => {
  try {
    readFileSync(path.join(r.root, rel, 'package.json'), 'utf8')
    return true
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false
    throw error
  }
}
const hasGlob = (segment: string): boolean => segment.includes('*') || segment.includes('?')
const matchesSegment = (name: string, pattern: string): boolean => {
  const source = pattern
    .split(/([*?])/)
    .map((part) => {
      if (part === '*') return '.*'
      if (part === '?') return '.'
      return part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${source}$`).test(name)
}

const normalizedWorkspaceSegments = (glob: string): string[] | null => {
  const segments = glob.replaceAll('\\', '/').split('/').filter((segment) => segment && segment !== '.')
  return segments.length && !segments.includes('..') ? segments : null
}

const workspaceMatches = (r: RepoFacts, glob: string): string[] => {
  const segments = normalizedWorkspaceSegments(glob)
  if (!segments) return []

  const expand = (prefix: string, index: number): string[] => {
    if (index === segments.length)
      return hasWorkspacePackage(r, prefix) ? [prefix] : []

    const segment = segments[index]!
    if (segment === '**') {
      const nested = workspaceDirs(r, prefix)
        .flatMap((name) => expand(prefix ? `${prefix}/${name}` : name, index))
      return [...expand(prefix, index + 1), ...nested]
    }

    const names = hasGlob(segment)
      ? workspaceDirs(r, prefix).filter((name) => matchesSegment(name, segment))
      : [segment]
    return names.flatMap((name) => expand(prefix ? `${prefix}/${name}` : name, index + 1))
  }

  return expand('', 0)
}

/**
 * Expands the REAL workspace globs. A hardcoded apps|packages|services|shared list
 * misses `infra`, which two repos here declare as a bare entry — those members
 * were previously never classified at all.
 *
 * readdir, not tracked(): at least one repo's members are git submodules, and
 * member discovery must not depend on staging state or .gitignore.
 */
export function workspaceMembers(r: RepoFacts): string[] {
  const includes = workspaceGlobs(r).filter((glob) => !glob.startsWith('!'))
  const excludes = workspaceGlobs(r)
    .filter((glob) => glob.startsWith('!'))
    .flatMap((glob) => workspaceMatches(r, glob.slice(1)))
  return [...new Set(includes.flatMap((glob) => workspaceMatches(r, glob)))]
    .filter((member) => !excludes.includes(member))
}

export const isWorkspaceRoot = (r: RepoFacts): boolean =>
  (workspaceGlobs(r).length > 0 || r.files('pnpm-workspace.yaml')) && workspaceMembers(r).length > 0

/** Can another package import this? main/exports is the contract. */
const consumable = (r: RepoFacts): boolean => !!(pkgOf(r)?.main || pkgOf(r)?.exports)

const CDK_DIRS = ['.', 'infra', 'cdk'] as const
const under = (dir: string, rel: string): string => (dir === '.' ? rel : `${dir}/${rel}`)
export const cdkDir = (r: RepoFacts): string | null =>
  CDK_DIRS.find((dir) => r.files(under(dir, 'cdk.json'))) ?? null

const HANDLER_DIRS = ['src/handlers', 'handlers', 'src/lambda'] as const
const handlerDir = (r: RepoFacts): string | null => HANDLER_DIRS.find((dir) => r.files(dir)) ?? null
const hasHandlers = (r: RepoFacts): boolean =>
  handlerDir(r) !== null || r.files('serverless.yml') || r.files('template.yaml')

const awsCdkNear = (r: RepoFacts): boolean => {
  const dir = cdkDir(r)
  if (!dir) return false
  try {
    const own = JSON.parse(r.read(under(dir, 'package.json')) ?? 'null') as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    } | null
    const deps = { ...(own?.dependencies ?? {}), ...(own?.devDependencies ?? {}) }
    return !!deps['aws-cdk-lib'] || !!r.deps['aws-cdk-lib']
  } catch {
    return !!r.deps['aws-cdk-lib']
  }
}

const binNames = (r: RepoFacts): string => {
  const bin = pkgOf(r)?.bin
  return typeof bin === 'string' ? bin : Object.keys(bin ?? {}).join(', ')
}

/**
 * Any positive signal belonging to an app/service/tooling kind. Stating exclusivity
 * ONCE here rather than pairwise inside every predicate is what stops the O(n^2)
 * coupling that left `cli` and `cdk-service` with the same hole C1 patched for one
 * of them. Returns the marker name so evidence can say WHY something was excluded.
 */
export function appMarkers(r: RepoFacts): string | null {
  if (r.deps.next) return 'next'
  if (r.deps.expo) return 'expo'
  if (r.deps['aws-cdk-lib']) return 'aws-cdk-lib'
  if (cdkDir(r) !== null) return 'cdk.json'
  if (hasHandlers(r)) return 'handler tree'
  if (pkgOf(r)?.bin && !consumable(r)) return 'bin'
  if (isWorkspaceRoot(r)) return 'workspace root'
  return null
}

const mdCount = (r: RepoFacts): number => r.tracked().filter((file) => file.endsWith('.md')).length
const pluginManifestPaths = (r: RepoFacts): string[] => {
  const manifest = (base: string): string[] =>
    ['marketplace.json', 'plugin.json']
      .map((name) => (base ? `${base}/.claude-plugin/${name}` : `.claude-plugin/${name}`))
      .filter((file) => r.files(file))
  return [
    ...manifest(''),
    ...r.list('').flatMap((entry) => manifest(entry)),
  ]
}
const pluginMarker = (r: RepoFacts): boolean => pluginManifestPaths(r).length > 0

export const KINDS: KindDef[] = [
  {
    id: 'workspace',
    inspects: 'package.json workspaces array or pnpm-workspace.yaml, plus at least one member directory containing a package.json',
    matches: (r) => isWorkspaceRoot(r),
    evidence: (r) => {
      const count = workspaceMembers(r).length
      const source = r.files('pnpm-workspace.yaml')
        ? 'pnpm-workspace.yaml'
        : `workspaces=${JSON.stringify(pkgOf(r)?.workspaces)}`
      return `${source}; ${count} member${count === 1 ? '' : 's'}`
    },
  },
  {
    id: 'next-app',
    inspects: 'package.json dependency on next; absence of a workspaces field',
    matches: (r) => !!r.deps.next && !isWorkspaceRoot(r),
    evidence: (r) =>
      `next dep; ${r.files('src/app') ? 'src/app/' : r.files('app') ? 'app/' : 'no app dir'}`,
  },
  {
    id: 'expo-app',
    inspects: 'package.json dependency on expo; absence of a workspaces field',
    matches: (r) => !!r.deps.expo && !isWorkspaceRoot(r),
    evidence: () => 'expo dep',
  },
  {
    id: 'cdk-service',
    inspects: 'cdk.json in ., infra/ or cdk/ with aws-cdk-lib alongside; no next or expo dependency; not a workspace root',
    matches: (r) =>
      cdkDir(r) !== null && awsCdkNear(r) && !isWorkspaceRoot(r) && !r.deps.next && !r.deps.expo,
    evidence: (r) => `${under(cdkDir(r)!, 'cdk.json')} + aws-cdk-lib`,
  },
  {
    id: 'lambda-service',
    inspects: 'a handler directory (src/handlers, handlers, src/lambda) or serverless.yml/template.yaml, with no main/exports, no cdk.json, and no next/expo dependency',
    matches: (r) =>
      hasHandlers(r) && !consumable(r) && cdkDir(r) === null && !isWorkspaceRoot(r) && !r.deps.next && !r.deps.expo,
    evidence: (r) => `${handlerDir(r) ?? 'serverless/template manifest'} present, no main/exports — deployable`,
  },
  {
    id: 'cdk-library',
    inspects: 'aws-cdk-lib dependency, no cdk.json anywhere, and a main or exports entrypoint',
    matches: (r) => !!r.deps['aws-cdk-lib'] && cdkDir(r) === null && consumable(r),
    evidence: () => 'aws-cdk-lib + entrypoint, no cdk.json — consumed, not deployed',
  },
  {
    id: 'cli',
    inspects: 'package.json bin field, with no main/exports, no handler tree, no cdk.json, and not a workspace root',
    matches: (r) =>
      !!pkgOf(r)?.bin && !consumable(r) && !hasHandlers(r) && cdkDir(r) === null &&
      !isWorkspaceRoot(r) && !r.deps.next && !r.deps.expo,
    evidence: (r) => `bin: ${binNames(r)}; no main/exports`,
  },
  {
    id: 'package',
    memberOnly: true,
    inspects: 'a workspace member with a package.json and none of the app, service, or cli markers',
    matches: (r) => !!r.pkg && appMarkers(r) === null,
    evidence: (r) =>
      `internal package ${pkgOf(r)?.name ?? '(unnamed)'}; ${
        consumable(r) ? `entry → ${String(pkgOf(r)?.main ?? '(exports)')}` : 'NO main/exports'
      }`,
  },
  {
    id: 'static-site',
    inspects: 'index.html at the repo root, with no app/service/cli markers and no Claude plugin manifest',
    matches: (r) => r.files('index.html') && appMarkers(r) === null && !pluginMarker(r),
    evidence: (r) => `index.html at root, no app markers${r.pkg ? ' (tooling package.json ok)' : ''}`,
  },
  {
    id: 'docs-repo',
    inspects: 'at least three committed .md files, no index.html, no app/service/cli markers, no Claude plugin manifest',
    matches: (r) =>
      !r.files('index.html') && mdCount(r) >= 3 && appMarkers(r) === null && !pluginMarker(r),
    evidence: (r) => `${mdCount(r)} tracked .md files, no app markers${r.pkg ? ' (tooling package.json ok)' : ''}`,
  },
  {
    id: 'toolkit',
    inspects: 'a .claude-plugin/marketplace.json or plugin.json within two directory levels, plus a package.json',
    matches: (r) => !!r.pkg && pluginMarker(r),
    evidence: (r) => `${pluginManifestPaths(r).join(', ')} manifest`,
  },
]

export function detectKind(r: RepoFacts): Detection {
  const hits = KINDS.filter((kind) => (kind.memberOnly ? r.isMember : true)).filter((kind) => kind.matches(r))
  if (hits.length === 0)
    return { kind: 'unknown', evidence: 'no signature matched', matched: [] }
  if (hits.length > 1)
    return {
      kind: 'ambiguous',
      evidence: `matched ${hits.map((kind) => kind.id).join(' + ')} — a signature is wrong`,
      matched: hits.map((kind) => kind.id),
    }
  return { kind: hits[0]!.id, evidence: hits[0]!.evidence(r), matched: [hits[0]!.id] }
}
