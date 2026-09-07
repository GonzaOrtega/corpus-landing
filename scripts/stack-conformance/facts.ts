import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type GitResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: 'not-installed' | 'not-a-repo' | 'output-too-large' | 'other' }

// Resolve `git` once. Pins which binary runs even if PATH is mutated later by a
// build step prepending node_modules/.bin.
let gitBin: string | null | undefined
export function resolveGit(): string {
  if (gitBin !== undefined) return gitBin ?? 'git'
  const names = process.platform === 'win32' ? ['git.exe', 'git.cmd'] : ['git']
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const exe of names) {
      const candidate = path.join(dir, exe)
      try {
        accessSync(candidate, constants.X_OK)
        gitBin = candidate
        return candidate
      } catch {
        /* keep scanning */
      }
    }
  }
  gitBin = null
  return 'git' // let execFileSync report ENOENT
}

// Default maxBuffer is 1 MiB — too small for `ls-files -z` on a large repo.
const MAX_GIT_OUTPUT = 16 * 1024 * 1024

export function runGit(args: string[], cwd: string): GitResult {
  try {
    return {
      ok: true,
      stdout: execFileSync(resolveGit(), args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: MAX_GIT_OUTPUT,
      }),
    }
  } catch (e) {
    const err = e as { code?: string; status?: number }
    if (err.code === 'ENOENT') return { ok: false, reason: 'not-installed' }
    if (err.code === 'ENOBUFS') return { ok: false, reason: 'output-too-large' }
    if (err.status === 128) return { ok: false, reason: 'not-a-repo' }
    return { ok: false, reason: 'other' }
  }
}

/**
 * Skipped for traversal, but REPORTED (see ignoredDirs) rather than hidden — a
 * committed `test-results/` is a finding for sub-project 2, and an ignore list that
 * silently swallowed it would blind the audit to the thing it exists to catch.
 */
const WALK_IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out',
  '.turbo', '.vercel', 'cdk.out', 'coverage', '.expo', '.cache', 'test-results',
])

export interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: unknown
  scripts?: Record<string, string>
  private?: boolean
  main?: unknown
  exports?: unknown
}

export interface RepoFacts {
  root: string
  pkg: PackageJson | null
  deps: Record<string, string>
  isMember: boolean
  gitOk: boolean
  files(rel: string): boolean
  read(rel: string): string | null
  list(rel: string): string[]
  /** Every non-ignored file under `rel`, at any depth, as paths relative to `rel`. */
  listDeep(rel: string): string[]
  workflows(): string[]
  wfContent(): string
  walk(rel: string): string[]
  tracked(): string[]
  ignoredDirs(): Array<{ dir: string; files: number }>
}

export function buildFacts(root: string, opts: { isMember?: boolean } = {}): RepoFacts {
  if (!existsSync(root)) throw new Error(`repo path does not exist: ${root}`)

  const read = (rel: string): string | null => {
    try {
      return readFileSync(path.join(root, rel), 'utf8')
    } catch {
      return null
    }
  }
  const list = (rel: string): string[] => {
    try {
      return readdirSync(path.join(root, rel))
    } catch {
      return []
    }
  }

  const skipped: Array<{ dir: string; files: number }> = []
  const countAll = (abs: string): number => {
    try {
      return readdirSync(abs, { withFileTypes: true }).reduce(
        (n, e) => n + (e.isDirectory() ? countAll(path.join(abs, e.name)) : 1),
        0,
      )
    } catch {
      return 0
    }
  }
  const walk = (rel: string, base = rel): string[] => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true })
    } catch {
      return []
    }
    return entries.flatMap((e) => {
      const next = rel ? `${rel}/${e.name}` : e.name
      if (WALK_IGNORE.has(e.name)) {
        skipped.push({ dir: next, files: countAll(path.join(root, next)) })
        return []
      }
      const relOut = base && next.startsWith(`${base}/`) ? next.slice(base.length + 1) : next
      return e.isDirectory() ? walk(next, base) : [relOut]
    })
  }

  let pkg: PackageJson | null = null
  try {
    pkg = JSON.parse(read('package.json') ?? 'null') as PackageJson | null
  } catch {
    pkg = null
  }

  let workflowCache: string[] | null = null
  const workflows = (): string[] => {
    workflowCache ??= list('.github/workflows').filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    return workflowCache
  }
  const wfContent = (): string =>
    workflows()
      .map((f) => read(`.github/workflows/${f}`) ?? '')
      .join('\n')

  let gitOk = true
  let trackedCache: string[] | null = null
  const tracked = (): string[] => {
    if (trackedCache) return trackedCache
    const probe = runGit(['rev-parse', '--is-inside-work-tree'], root)
    if (!probe.ok || probe.stdout.trim() !== 'true') {
      // Explicit probe, not an exception as control flow. Without the fallback,
      // every count-based signature silently reads 0 files in a non-git directory
      // and the repo resolves to `unknown` for a reason unrelated to its shape.
      gitOk = false
      trackedCache = walk('')
      return trackedCache
    }
    // --recurse-submodules is valid ONLY with --cached/--stage. One repo here has three
    // submodules; without this their contents are one opaque gitlink line.
    const out = runGit(['ls-files', '-z', '--cached', '--recurse-submodules'], root)
    trackedCache = out.ok ? out.stdout.split('\u0000').filter(Boolean) : []
    return trackedCache
  }

  return {
    root,
    pkg,
    deps: { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) },
    isMember: opts.isMember ?? false,
    get gitOk() {
      tracked()
      return gitOk
    },
    files: (rel) => existsSync(path.join(root, rel)),
    read,
    list,
    listDeep: (rel) => walk(rel),
    workflows,
    wfContent,
    walk: (rel) => walk(rel),
    tracked,
    ignoredDirs: () => {
      walk('')
      return skipped
    },
  }
}
