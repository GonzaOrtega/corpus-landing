# Corpus Landing

The public landing page for **Corpus** — it explains the product, collects
early-access signups, confirms them, lets subscribers manage or revoke their own
subscription, sends exactly one launch notification, and then flips the whole
site from *early access* to *Get Corpus* mode.

> **Status: pre-implementation.** This repository currently holds the approved
> design specification, the 22-task implementation plan, and the visual
> prototypes. No application code has been written yet. Work begins at packet
> **P0** — see [`docs/execution/stages.md`](docs/execution/stages.md).

## Release stages

The site has exactly two, selected by validated server configuration:

| `CORPUS_RELEASE_STAGE` | Behaviour |
|---|---|
| `early-access` | Signup form visible, server accepts submissions, CTA reads *Join early access* |
| `launched` | Form removed, submissions rejected, CTA reads *Get Corpus* and points at `CORPUS_DOWNLOAD_URL` |

Everything else — hero, scrollytelling, Living Lexicon, philosophy section,
motion choreography — is identical across both stages.

## Stack

Next.js (App Router) · TypeScript strict · Bun · Drizzle ORM on Neon
PostgreSQL · Resend for transactional email · GSAP for motion · Vercel for
hosting. Architecture follows the Claude Stack `next-app` blueprint with
capabilities `persistence`, `external-api`, `notifications`, `config-secrets`.

Boundaries are hexagonal — `core ← adapters ← composition` — with separate web
and operations composition roots. There is deliberately **no public signup REST
API**; signup is a Server Action only.

## Repository layout

```text
docs/
  superpowers/specs/    approved design specification (the contract)
  superpowers/plans/    22-task implementation plan
  execution/            packet ladder, model routing, stage gates
  design/prototypes/    HTML visual sources of truth (reference, not shipped)
  operations/           runbooks and deferred infrastructure decisions
```

`docs/superpowers/specs/` is the authority on product behaviour. Implementation
may choose mechanics; it may not reinterpret behaviour, copy, or semantics.

## Configuration

No secret value is ever committed. `.env.example` will carry variable **names**
and safe descriptions only; the full contract is specified in §35 of the design
spec. Local development runs against fake adapters, so the build does not
require real Neon, Resend, or reCAPTCHA credentials.

## Verification

Once P0 lands:

```bash
bun install
bun run check   # typecheck + Biome + stack conformance
bun run test    # Vitest
bun run e2e     # Playwright
```

CI additionally runs `preview` (deployment against a disposable Neon branch) and
`lighthouse`.

## Deployment

Merging to `main` does **not** deploy. Production release is an explicit
`workflow_dispatch` against a specific `main` SHA, running migrate → stage
without domain → smoke test → re-verify SHA → zero-rebuild promote. Rollback is
a promotion of the previous known-good Vercel deployment. Migrations follow
expand → deploy → contract.

## A note on visibility

This repository is private today and will be made public. Git history is not
rewritten by changing visibility, so it is written to public standards from the
first commit: no secrets, no personal data, no token-shaped fixtures, anywhere
in history. A full-history gitleaks scan enforces this on every push.

Branch protection is not yet active — GitHub Free does not offer it on private
repositories. The exact ruleset and the commands to apply it at the flip are in
[`docs/operations/branch-protection.md`](docs/operations/branch-protection.md).

## License

[MIT](LICENSE) © 2026 Gonzalo Ortega
