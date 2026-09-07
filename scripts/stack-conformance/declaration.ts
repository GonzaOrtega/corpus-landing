import { CAPABILITIES, type Capability } from './capabilities'
import type { RepoFacts } from './facts'
import type { Intent, Kind } from './kinds'
import { truncate } from './sanitize'

export type PackageManager = 'bun' | 'pnpm' | 'npm' | 'yarn'
export const PACKAGE_MANAGERS: readonly PackageManager[] = ['bun', 'pnpm', 'npm', 'yarn']

export interface Declaration {
  kind: Kind
  intent: Intent
  /** Required when kind is 'other'; forbidden otherwise. */
  reason?: string
  pin?: { kind: Kind; reason: string }
  capabilities?: Capability[]
  /** Which package manager this repo uses. Absent means the stack default, bun. */
  packageManager?: PackageManager
}

export interface ValidationError {
  path: string
  message: string
}

/** A merge gate reads a file any PR can edit. Cap before parsing. */
export const MAX_DECLARATION_BYTES = 8 * 1024

const KINDS_ALL = [
  'next-app', 'expo-app', 'workspace', 'package', 'cli',
  'cdk-service', 'lambda-service', 'cdk-library',
  'static-site', 'docs-repo', 'toolkit', 'other',
] as const
const INTENTS = ['production', 'sandbox', 'exempt'] as const
const KNOWN_FIELDS = new Set(['$schema', 'kind', 'intent', 'reason', 'pin', 'capabilities', 'packageManager'])
const KNOWN_PIN_FIELDS = new Set(['kind', 'reason'])

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function validateDeclaration(value: unknown): ValidationError[] {
  if (!isPlainObject(value)) return [{ path: '$', message: 'must be a JSON object' }]
  const errs: ValidationError[] = []
  const fail = (path: string, message: string): void => { errs.push({ path, message }) }

  if (typeof value.kind !== 'string' || !(KINDS_ALL as readonly string[]).includes(value.kind))
    fail('$.kind', `must be one of ${KINDS_ALL.join(', ')}`)
  if (typeof value.intent !== 'string' || !(INTENTS as readonly string[]).includes(value.intent))
    fail('$.intent', `must be one of ${INTENTS.join(', ')}`)
  if (value.$schema !== undefined && typeof value.$schema !== 'string')
    fail('$.$schema', 'must be a string')

  // `other` is the tool's own suggested escape from an `unknown` nag, so it carries
  // the same friction as a pin: say why.
  const hasReason = typeof value.reason === 'string' && value.reason.trim().length > 0
  if (value.kind === 'other' && !hasReason)
    fail('$.reason', 'required when kind is "other" — say why this repo has no shape')
  if (value.kind !== 'other' && value.reason !== undefined)
    fail('$.reason', 'only permitted when kind is "other"')

  if ('capabilities' in value) {
    const caps = (value as { capabilities: unknown }).capabilities
    if (!Array.isArray(caps)) {
      fail('$.capabilities', 'capabilities must be an array')
    } else {
      const seen = new Set<string>()
      for (const c of caps) {
        if (typeof c !== 'string' || !(CAPABILITIES as string[]).includes(c)) {
          fail('$.capabilities', `unknown capability: ${String(c)}`)
        } else if (seen.has(c)) {
          fail('$.capabilities', `duplicate capability: ${c}`)
        }
        if (typeof c === 'string') seen.add(c)
      }
    }
  }

  if (value.packageManager !== undefined) {
    const pm = value.packageManager
    if (typeof pm !== 'string' || !(PACKAGE_MANAGERS as readonly string[]).includes(pm))
      fail('$.packageManager', `must be one of ${PACKAGE_MANAGERS.join(', ')}`)
  }

  if (value.pin !== undefined) {
    if (!isPlainObject(value.pin)) fail('$.pin', 'must be an object')
    else {
      if (typeof value.pin.kind !== 'string' || !(KINDS_ALL as readonly string[]).includes(value.pin.kind))
        fail('$.pin.kind', `must be one of ${KINDS_ALL.join(', ')}`)
      if (typeof value.pin.reason !== 'string' || value.pin.reason.trim().length === 0)
        fail('$.pin.reason', 'required and non-empty — a reasonless pin is rejected')
      for (const k of Object.keys(value.pin)) if (!KNOWN_PIN_FIELDS.has(k)) fail(`$.pin.${k}`, 'unknown field')
    }
  }

  for (const k of Object.keys(value)) if (!KNOWN_FIELDS.has(k)) fail(`$.${k}`, 'unknown field')
  return errs
}

export type DeclarationResult =
  | { state: 'missing' }
  | { state: 'too-large'; bytes: number }
  | { state: 'unparseable'; detail: string }
  | { state: 'invalid'; errors: ValidationError[] }
  | { state: 'ok'; declaration: Declaration; tracked: boolean }

export function readDeclaration(r: RepoFacts): DeclarationResult {
  const raw = r.read('stack.json')
  if (raw === null) return { state: 'missing' }
  if (Buffer.byteLength(raw, 'utf8') > MAX_DECLARATION_BYTES)
    return { state: 'too-large', bytes: Buffer.byteLength(raw, 'utf8') }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { state: 'unparseable', detail: truncate(String((e as Error).message), 120) }
  }
  const errors = validateDeclaration(parsed)
  if (errors.length) return { state: 'invalid', errors }
  const v = parsed as Record<string, unknown>
  // Explicit field copy — never Object.assign or a recursive merge onto a shared
  // object, which is the only shape where a __proto__ key becomes dangerous.
  const declaration: Declaration = { kind: v.kind as Kind, intent: v.intent as Intent }
  if (typeof v.reason === 'string') declaration.reason = v.reason
  if (isPlainObject(v.pin))
    declaration.pin = { kind: v.pin.kind as Kind, reason: v.pin.reason as string }
  if (Array.isArray(v.capabilities)) declaration.capabilities = v.capabilities as Capability[]
  if (typeof v.packageManager === 'string')
    declaration.packageManager = v.packageManager as PackageManager
  // Provenance, not presence. `read` above answers "is it on disk"; a declaration
  // that git has never been told about is invisible to a fresh clone, to CI, and
  // to the path protection this file is supposed to be guarded by. In a non-git
  // directory `tracked()` falls back to a walk, so this stays true and the check
  // does not nag about a question that cannot be answered there.
  return { state: 'ok', declaration, tracked: r.tracked().includes('stack.json') }
}
