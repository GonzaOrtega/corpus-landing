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

## P0 handoff — read this before scaffolding

`create-next-app` refuses to scaffold into a directory containing files outside
its allowlist. As of current Next.js the allowlist is: `.claude`, `.cursor`,
`.DS_Store`, `.git`, `.gitattributes`, `.gitignore`, `.gitlab-ci.yml`, `.hg*`,
`.idea`, `.npmignore`, `.travis.yml`, `.vscode`, `.zed`, `LICENSE`,
`Thumbs.db`, `docs`, `mkdocs.yml`, log files, `.yarn`, `yarnrc.yml`.

`README.md`, `SECURITY.md` and `.github/` are **not** on it — `README.md` was
removed from the list in current versions. So running the scaffold in place here
will abort with a conflict list.

This is expected. Scaffold into a sibling directory and merge:

```bash
cd /home/gonza/github
bun create next-app corpus-landing-scaffold \
  --typescript --tailwind --app --no-src-dir --import-alias "@/*"

# Merge in, preserving the repo's own git history and hygiene files.
rsync -a \
  --exclude .git \
  --exclude README.md \
  --exclude .gitignore \
  corpus-landing-scaffold/ corpus-landing/

rm -rf corpus-landing-scaffold
cd corpus-landing && git status
```

Review `git status` before staging: the scaffold's `.gitignore` was excluded on
purpose because this repository already ships a stricter one.

Task 1 Step 3 then asks whether Tailwind survives — decide that against live
Claude Stack conformance, not against the flag used above.

## Local URL

Once P0 makes this a Next.js project, `/home/gonza/github/CLAUDE.md` requires a
`.ports.json` entry. Next free port at the time of writing: **3018**
(`https://corpus-landing.lvh.me`). Registering it touches the shared Caddyfile,
so per that convention it must be confirmed before being applied — it is not
done yet.
