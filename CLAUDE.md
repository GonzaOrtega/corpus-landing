# corpus-landing

## Purpose

Public early-access landing page for Corpus: explains the product, collects
and confirms signups, lets subscribers self-manage/unsubscribe, sends one
launch notification, then flips the whole site to "Get Corpus" mode. Full
behavioral contract: `docs/superpowers/specs/2026-09-06-corpus-landing-design.md`.

## Stack

Next.js (App Router, RSC-first) · TypeScript strict · Drizzle ORM on Neon
PostgreSQL · Vitest · Playwright · GSAP · Resend · bun only · Vercel.

Tailwind was intentionally removed at scaffold time (spec-driven decision,
not a stack default override) — styling is plain CSS per feature.

## Architecture

Hexagonal: `core` declares ports, `adapters` implement them, `core` never
imports `adapters`. Adapter construction only happens under
`composition/capabilities/`. See spec §13–§14 for the full source shape and
`docs/architecture.md` for the implemented request and operations boundaries.

No public signup REST API — signup and management are Server Actions. Launch
email uses the separate `composition/ops` root; the only API route is the
authorized Vercel Cron maintenance entry point.

## Commands

- `bun run dev` — start the local development server; use your local port
  registry or assignment if one is configured for your environment.
- `bun run check` — typecheck + lint + stack conformance (the birth-certificate gate)
- `bun run test` — Vitest
- `bun run test:e2e` — containerized Playwright
- `bun run test:all` — check + Vitest + containerized Playwright
- `bunx drizzle-kit generate` — migrations (never hand-edit the DB)

## What NOT to change without asking

- `docs/superpowers/specs/2026-09-06-corpus-landing-design.md` — the approved
  design spec is a contract, not a draft. Implementation may choose mechanics;
  it may not reinterpret product behavior, copy, or semantics (spec §1, §38).
  New specs may be *added* to that directory; this file is what is protected.
- `.github/workflows/secret-scan.yml` and `docs/operations/branch-protection.md`
  — this repo is private now, public later; both encode why and how.
- `LICENSE`, `SECURITY.md`, `docs/architecture.md`, and the launch/privacy
  runbooks — public contracts and safety procedures; update them deliberately.
- Anything under `docs/design/prototypes/` — visual sources of truth, not
  shipped code.

Mirrored in `.claude/protected-files.txt`.
