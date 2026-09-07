# Execution stages

The canonical sources are `token-efficient-guide.md` (packets, model routing)
and `../superpowers/plans/2026-09-06-corpus-landing.md` (22 tasks). This file is
the operator's map: what order to run them in, what each stage must produce
before the next begins, and what has to exist outside the repository first.

## Stage 0 — Repository container ✅ done

Private `GonzaOrtega/corpus-landing`, MIT-licensed, planning docs and design
prototypes filed under `docs/`, public-grade hygiene from commit #1.

No application code. That is deliberate: P0 is routed to a mid-tier model, and
scaffolding it from a different session would have burned the wrong budget and
skipped the conformance gate.

## The packet ladder

| Packet | Tasks | Produces | Executor | Tier | Strong model? |
|---|---:|---|---|---|---|
| **P0** | 1 | Claude Stack scaffold, `stack.json`, born-green conformance | Claude Code | C1 Sonnet 5 | No |
| **P1** | 2–5 | Config contract, domain model, Neon/Drizzle adapter, token + logging primitives | Codex | X1 Terra | No |
| **P2** | 6–7 | Idempotent join/resubscribe, CAPTCHA port, signup Server Action | Codex | X1 Terra | Only if stuck |
| **P3** | 8–10 | Confirmation email + retry, manage/unsubscribe flow, retention cron | Claude Code | C1 Sonnet 5 | No |
| **P4** | 11–12 | Launch email idempotency, dry run, human-gated production send | Either | **C2 Opus 5 / X2 Sol** | **Yes** |
| **P5** | 13–15 | Landing shell, GSAP choreography, Living Lexicon | Claude Code | C1 Sonnet 5 | No |
| **P6** | 16–17 | Release-aware CTA, legal pages, SEO, analytics | Claude Code | C1 Sonnet 5 | No |
| **P7** | 18 | Playwright + axe + Lighthouse acceptance gates | Codex | X1 Terra | No |
| **P8** | 19–21 | CI, Neon preview branches, production deploy, public hardening | Codex | X1 Terra → **X2 for Task 20** | Partly |
| **P9** | 22 | Definition-of-Done audit | **Opposite vendor** from the main implementer | C2 / X2 | **Yes** |

## Order

```text
P0 → P1 → P2 → P3 → P4 → P6 → P7 → P8 → P9
                 ↘                 ↗
       P1 ─────────→ P5 ──────────┘   (P5 merges before P6)
```

Two rules that are not negotiable:

- **P2, P3 and P4 must not be parallelized.** They mutate the same
  subscriber/delivery state machine. Concurrent edits produce a state machine
  that is individually correct per packet and collectively wrong.
- **P5 is the one safe parallel branch.** It only needs the foundation from P1.
  Run it in a separate git worktree while P2–P4 proceed, and merge both lines
  before starting P6.

## When to escalate to a strong model

Start every packet at its default tier. Escalate only when one of these is true:

1. The task carries an explicit **never-do-twice** or **fail-closed** invariant.
2. The task touches credentials, PII, token handling, or production secrets.
3. The task changes the production promotion path.
4. A default-tier model has failed **two** focused cycles on the same root cause.
5. Final verification finds a cross-cutting inconsistency that cannot be
   localized cheaply.

P4 and P9 meet these by construction, which is why they are strong by default.
Nothing else is.

## Token discipline

Each packet's "Read only" list in `token-efficient-guide.md` is a ceiling, not a
suggestion. In particular:

- Never preload the whole design spec — it is ~1,650 lines.
- Do not carry a previous packet's transcript into the next packet. Start fresh
  and let the repository be the state.
- `docs/design/prototypes/landing-lexicon.html` is 64 KB. It belongs to P5 only.
  Read it in targeted slices, never whole, and never in P0–P4.
- Strong-model review should be diff-first, not repository-first.

## Completion gates

A packet is done when its gate passes — not when the code looks finished.

- **P0** — `stack.json` correct; stack conformance, typecheck and Biome all exit 0; one clean commit.
- **P1** — config validated at boot; domain types compile; generated migration applied against a real Neon branch.
- **P2** — a repeat signup provably creates no second record.
- **P3** — confirmation retry semantics hold; unsubscribe works without the token appearing in a URL (§7.2).
- **P4** — dry run produces a fingerprint and count; no recipient can be sent to twice.
- **P5** — motion and Lexicon behaviour match the prototype, with reduced-motion honoured.
- **P6** — both release stages render correctly; legal pages present; preview environments non-indexable.
- **P7** — the full Playwright matrix, axe, and Lighthouse budgets pass.
- **P8** — CI green on a real PR with a disposable Neon branch; production stage → smoke → promote rehearsed.
- **P9** — every Definition-of-Done item mapped to an automated or manual check.

## External prerequisites

Spec §40 lists the values that are *intentionally unresolved* — the final
domain, real `EMAIL_FROM`, reCAPTCHA credentials, Vercel/Neon IDs. Those are not
blockers: the adapters ship with local fakes, so P1–P7 run entirely offline.

What genuinely must exist, and when:

| Needed by | What | Notes |
|---|---|---|
| P1 (Task 4) | A Neon project + `DATABASE_URL` | Needed to generate and apply the first migration for real. |
| P8 (Task 19) | `NEON_CI_DATABASE_URL` repo secret, Vercel project link | CI creates a `pr-<number>` branch off `development`. |
| P8 (Task 20) | Vercel production project, verified sending domain | Production is `workflow_dispatch` only — merging to `main` never deploys. |
| Before real launch send | Resend API key, verified subdomain, postal address | P4's dry run must pass first. |

## Stage 1 / Task 1 — Scaffold ✅ done

`create-next-app` refused to scaffold in place, as expected (see below), so it
was scaffolded into a sibling directory and merged in with `rsync`, excluding
`.git`, `README.md`, and `.gitignore` so the repo's own history and hygiene
files survived untouched.

What's actually in the repo now, beyond the plain scaffold:

- **Tailwind removed.** Live conformance (`scripts/stack-conformance/`) does
  not check for Tailwind at all — it's a stack-default convention, not a
  gated requirement — so per Task 1 Step 3 it was stripped and
  `app/globals.css` rewritten as plain CSS. `postcss.config.mjs` and the
  Next.js demo SVGs in `public/` were removed with it.
- **`typescript@npm:@typescript/typescript6`**, exactly as the skill warns.
  It ships no `tsc` binary of its own (only `tsc6`) — it pulls in
  `@typescript/old` as an internal dependency, and bun's bin-linker hoists
  *that* package's `tsc` to root `.bin/`. Verified: `tsc --version` reports
  `6.0.3`, the full classic compiler, not TS7's API-less rewrite.
- **`@types/bun` + `scripts/bun-env.d.ts`.** The vendored
  `stack-audit.ts` uses `import.meta.main`, a Bun ambient type. Rather than
  set `"types": ["bun"]` in the root tsconfig — which would suppress the
  default implicit inclusion of every other `@types/*` package — a scoped
  `scripts/bun-env.d.ts` with a single `/// <reference types="bun-types" />`
  pulls in just that ambient global.
- **`biome.json` migrated** from the schema `create-next-app --biome`
  generates (1.9.0-shaped) to the installed Biome 2.4.2's schema, via
  `biome migrate --write`. Also excludes `scripts/stack-conformance/**` and
  `docs/design/prototypes/**` from lint/format entirely — the first is a
  byte-identical vendor copy (reformatting it would read as drift to
  `vendor-drift.ts`, which only tolerates JSON formatting differences, not
  `.ts`), the second is prototype reference material that must never be
  rewritten (learned the hard way: an early `biome check --write .` pass, run
  before this exclusion existed, rewrote `function(){}` to `() => {}` inside
  `landing-lexicon.html`'s embedded scripts — reverted via `git checkout --`
  before it was ever committed).
- **The real `early_access_signups` schema and its first migration**,
  earlier than the plan's task numbering implies. `stack:check --ci` gates on
  `migrations-exist` for any repo with `drizzle-orm` + the `persistence`
  capability — there is no path to a green birth certificate without a
  `drizzle.config.ts` and a committed `.sql` migration. Rather than fabricate
  a throwaway placeholder table Task 4 would immediately replace, the real
  table from spec §9 was implemented directly (`src/adapters/db/schema.ts` +
  `drizzle/0000_curly_ares.sql`) — the spec already fully constrains it, so
  this isn't invention, just earlier-than-planned execution. **Task 4 inherits
  this schema already done**; what remains for Task 4 is the repository class
  implementing the port (mapping rows ↔ `EarlyAccessSignup`) and wiring it
  into a capability provider.
- **`ci.yml` (`check` + `test` jobs) and `e2e.yml` (`e2e` job)**, also earlier
  than planned, for the same reason: `stack:check --ci` gates red on
  `ci-workflow` and `e2e-workflow` without them. Job names already match
  three of spec §31's five required check names, so Task 19 extends this file
  rather than restructuring it. All actions SHA-pinned per the plan's global
  constraint (stricter than live conformance, which only requires pinning
  non-`actions/*` actions) — `actions/checkout@3d3c42e5...` (v7.0.1) and
  `oven-sh/setup-bun@0c5077e5...` (v2.2.0), both verified against GitHub's API
  at write time, not copied from memory. `secret-scan.yml` was retrofitted to
  match (checkout SHA-pinned, gitleaks download now checksum-verified) — this
  required an explicit yes/no confirmation since it's in
  `.claude/protected-files.txt`.
- **`typecheck` runs `next typegen && tsc --noEmit`**, not bare `tsc`.
  Next 16's `LayoutProps<"/">` helper type (used in `app/layout.tsx`, exactly
  as `create-next-app` generated it) is defined in `.next/types/`, which only
  Next's IDE language-service plugin or an explicit generation step produces
  — bare `tsc` never triggers it. Without this, `bun run typecheck` only
  worked by accident of a stale `.next/` on disk; on a genuinely fresh
  checkout it fails with `Cannot find name 'LayoutProps'`. `next typegen`
  (Next 16) generates just the types, no full build.

**Known non-blocking findings**, left for later tasks rather than forced now
(none of these are `ciEligible`, so `stack:check --ci` is green regardless):

- `capabilities-declared-matches: config-secrets` — stack-audit's only
  detection signal for this capability is `@aws-sdk/client-secrets-manager` /
  `@aws-sdk/client-ssm`. This project's config-secrets is Zod-validated env
  vars, which the heuristic doesn't recognize — an upstream claude-stack gap,
  not something to fake by adding an irrelevant AWS SDK dependency.
- `blueprint-naming: src/adapters/db/schema.ts` — adapter-scope files must
  match `^[a-z0-9-]+\.(adapter|repository)\.ts$`. A schema/DDL module isn't
  really "an adapter" in the sense the rule means, but the scope walk doesn't
  distinguish. Task 4 should decide the final layout when it adds the actual
  repository class alongside it.
- `seed-script`, `playwright-setup`, `member-has-tests` — no seed script,
  Playwright config, or tests exist yet. Expected; TDD starts at Task 2/3,
  and Task 18 owns the full Playwright matrix.
- `docs-trio` (advisory-only, `ciEligible: false`) — the generic
  `/doc-onboard` docs trio (`docs/overview.md` etc.) doesn't exist. This
  project's own Task 21 builds a different, spec-driven doc set
  (`docs/architecture.md`, `docs/operations/*`); the generic trio was not
  pursued as it's a separate, optional system this plan doesn't reference.

**Verified, not just asserted:** `bun run check` (typecheck + lint +
stack:check) exits 0 from a fully clean `.next`-free state; `bun run build`
succeeds and prerenders `/` and `/_not-found`. `bun run dev` could not be
confirmed rendering live — Turbopack's file watcher needs more inotify
instances than this machine's `fs.inotify.max_user_instances=128` allows, a
pre-existing host setting (`sudo` requires interactive auth, not available
here), unrelated to this scaffold. Worth raising `max_user_instances` on this
machine at some point — every Turbopack-based project here will hit the same
wall.

**Real CI failure caught post-push, then fixed:** the first push had `check`
green but `test` red — `vitest run` treats zero test files as a failure by
default (`No test files found, exiting with code 1`), and no tests exist yet
(TDD starts at Task 2/3). `test` is one of spec §31's five required checks;
leaving it permanently red on a scaffold-only commit would have blocked every
PR the moment branch protection goes live. Fixed with a minimal
`vitest.config.ts` setting `passWithNoTests: true` — it only changes the
zero-tests case, a real failing test still fails the build. While in there,
also added `"type": "module"` to `package.json`: Vite's native config loader
warned that ESM syntax in a `.ts` config loaded as CommonJS "is planned to
become the default" to require in a future major version, and `corpus` (the
sibling canonical-brand repo) already sets it. Verified `drizzle-kit
generate` still produces byte-identical SQL after that change before
committing it.

## Original P0 handoff note — read this before scaffolding a *different* repo

`create-next-app` refuses to scaffold into a directory containing files
outside its allowlist. As of current Next.js the allowlist is: `.claude`,
`.cursor`, `.DS_Store`, `.git`, `.gitattributes`, `.gitignore`,
`.gitlab-ci.yml`, `.hg*`, `.idea`, `.npmignore`, `.travis.yml`, `.vscode`,
`.zed`, `LICENSE`, `Thumbs.db`, `docs`, `mkdocs.yml`, log files, `.yarn`,
`yarnrc.yml`.

`README.md`, `SECURITY.md` and `.github/` are **not** on it — `README.md` was
removed from the list in current versions. So running the scaffold in place
aborts with a conflict list; scaffold into a sibling directory and `rsync` in,
excluding `.git`, `README.md`, `.gitignore` (this repo's own is stricter than
the generated one).

## Local URL

Once P0 makes this a Next.js project, `/home/gonza/github/CLAUDE.md` requires a
`.ports.json` entry. Next free port at the time of writing: **3018**
(`https://corpus-landing.lvh.me`). Registering it touches the shared Caddyfile,
so per that convention it must be confirmed before being applied — it is not
done yet.
