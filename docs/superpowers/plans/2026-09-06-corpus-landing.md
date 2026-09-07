# Corpus Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone public `corpus-landing` Next.js application exactly as defined by `CORPUS_LANDING_FINAL_DESIGN_SPEC.md`, including the approved landing experience, early-access lifecycle, email delivery, privacy/retention, launch operations, CI/CD, accessibility, and production release controls.

**Architecture:** Start from the current Claude Stack `new-project` → `vercel-app` blueprint with `kind: next-app` and capabilities `persistence`, `external-api`, `notifications`, and `config-secrets`. Keep domain/application logic in `core`, foreign systems in `adapters`, adapter construction in `composition/capabilities`, and feature use-case construction in feature wiring. The public site remains static/server-rendered by default, with bounded client islands only for GSAP interaction, CAPTCHA, signup state, and management-token fragment handling.

**Tech Stack:** Bun, Next.js App Router, React, TypeScript strict mode, Drizzle ORM, Neon PostgreSQL, Zod, GSAP, Resend, React Email, Pino, Vercel Analytics, Vercel Speed Insights, Vitest, Playwright, `@axe-core/playwright`, Lighthouse CI, Biome, dependency-cruiser, Claude Stack conformance.

**Spec:** `CORPUS_LANDING_FINAL_DESIGN_SPEC.md`

## Global Constraints

- Treat the supplied landing HTML and both supplied email HTML files as visual source material; do not redesign them.
- Main Corpus repository remains canonical for the approved Corpus mark and brand identity; snapshot approved assets into this repo with no runtime/build dependency on Corpus.
- Release stage is exactly `early-access | launched`.
- Use server-side validated configuration; `CORPUS_DOWNLOAD_URL` is required only in launched mode.
- No public REST API for signup; signup and management use Server Actions.
- Node.js runtime only; no Edge runtime in v1.
- Use Drizzle-generated migrations only.
- Store only SHA-256 hashes of management tokens; never store or log raw tokens.
- Management email links carry the raw token only in the URL fragment.
- Production CAPTCHA is score-based Google reCAPTCHA Essentials with action `early_access_signup`; preview/CI/local use deterministic non-network fakes.
- Neon persistence, not Resend delivery, determines signup success.
- Confirmation retry maximum is 3 total attempts.
- Launch-send priority is never sending a launch notification twice; ambiguous recipients become `manual_review` after the provider idempotency window.
- Vercel Cron performs daily maintenance; GitHub Actions perform the one-time human-gated launch send.
- CSS-first; no Tailwind utility implementation of the landing or emails.
- GSAP is the only animation framework.
- No custom behavioral analytics, ad pixels, session replay, email open tracking, or email click tracking.
- Accessibility target is WCAG 2.2 AA.
- Preview/local/test must be `noindex, nofollow`; production must be `index, follow`.
- Required CI check names: `check`, `test`, `preview`, `e2e`, `lighthouse`.
- All GitHub Actions must be SHA-pinned according to current Claude Stack production standards.
- Real credentials, connection strings, subscriber data, raw tokens, or PII must never enter Git, logs, fixtures, docs, workflows, or artifacts.
- Use squash-merge PR workflow; `main` is the only long-lived Git branch.

---

## File Structure Map

The current Claude Stack scaffold is authoritative if generated paths differ slightly. The intended ownership is:

```text
src/
├── app/
│   ├── api/cron/maintenance/route.ts
│   ├── early-access/manage/page.tsx
│   ├── opengraph-image.tsx
│   ├── privacy/page.tsx
│   ├── robots.ts
│   ├── sitemap.ts
│   ├── terms/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── adapters/
│   ├── captcha/
│   ├── db/
│   ├── email/
│   │   └── templates/
│   └── logging/
├── components/
├── composition/
│   ├── capabilities/
│   ├── ops/
│   └── server/
├── config/
├── core/
│   ├── entities/
│   ├── errors/
│   ├── mappers/
│   ├── ports/
│   ├── repositories/
│   ├── results/
│   ├── testing/
│   └── use-cases/
├── features/
│   ├── early-access/
│   │   ├── actions/
│   │   ├── backend/
│   │   ├── schemas/
│   │   ├── ui/
│   │   ├── early-access.css
│   │   └── early-access.wiring.ts
│   └── landing/
│       ├── content/
│       ├── motion/
│       ├── ui/
│       └── landing.css
├── lib/
└── ops/

public/
├── brand/
└── icons/

drizzle/

tests/
├── e2e/
├── integration/
└── unit/

.github/workflows/
├── ci.yml
├── preview.yml
├── e2e.yml
├── lighthouse.yml
├── deploy-production.yml
└── launch-email.yml
```

---

### Task 1: Scaffold the repository at current Claude Stack standard

**Files:**
- Create: repository root `corpus-landing/`
- Create: `stack.json`
- Create/modify: scaffold-generated Claude Stack files, `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `.dependency-cruiser.json`, `.env.example`, `vercel.json`, `CLAUDE.md`, `.claude/settings.json`, `.claude/protected-files.txt`
- Create: `docs/context/overview.md`
- Create: `docs/superpowers/specs/2026-09-06-corpus-landing-design.md` as a verbatim/reference copy of the approved design spec or a short wrapper pointing to the checked-in canonical spec
- Create: `docs/superpowers/plans/2026-09-06-corpus-landing.md` from this plan

**Interfaces:**
- Consumes: current `GonzaOrtega/claude-stack` `main`, `new-project` `vercel-app` flow.
- Produces: a born-green Next.js repository with Playwright enabled and declared capabilities `persistence`, `external-api`, `notifications`, `config-secrets`.

- [ ] **Step 1: Scaffold with the current Claude Stack `vercel-app` profile**

Use project name `corpus-landing`, Playwright enabled, and capabilities:

```json
[
  "persistence",
  "external-api",
  "notifications",
  "config-secrets"
]
```

- [ ] **Step 2: Declare the production shape**

Create `stack.json` using the vendored schema path from the current stack:

```json
{
  "$schema": "./scripts/stack-conformance/stack.schema.json",
  "kind": "next-app",
  "intent": "production",
  "capabilities": [
    "persistence",
    "external-api",
    "notifications",
    "config-secrets"
  ]
}
```

- [ ] **Step 3: Remove Tailwind if the current conformance rules do not require it**

Remove Tailwind packages/config and replace generated page styling with CSS files. Keep Tailwind only if the live Claude Stack conformance check explicitly requires it.

- [ ] **Step 4: Install intentional runtime dependencies**

```bash
bun add drizzle-orm @neondatabase/serverless zod gsap resend @react-email/components pino @vercel/analytics @vercel/speed-insights
```

- [ ] **Step 5: Install intentional development dependencies**

```bash
bun add -d drizzle-kit vitest @vitejs/plugin-react @playwright/test @axe-core/playwright @lhci/cli dependency-cruiser typescript@npm:@typescript/typescript6
```

- [ ] **Step 6: Add project scripts**

`package.json` must expose at least:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "stack:check": "bun scripts/stack-conformance/stack-audit.ts . --ci",
    "check": "bun run typecheck && bun run lint && bun run stack:check"
  }
}
```

- [ ] **Step 7: Verify the birth certificate**

Run:

```bash
bun install --frozen-lockfile
bun run stack:check
bun run typecheck
bun run lint
```

Expected: all exit `0`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold corpus landing"
```

---

### Task 2: Establish configuration, release-stage validation, and safe runtime boundaries

**Files:**
- Create: `src/config/server-env.ts`
- Create: `src/config/public-env.ts`
- Create: `src/config/release-stage.ts`
- Create: `src/config/server-env.test.ts`
- Modify: `.env.example`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `ServerConfig`, `PublicConfig`, `ReleaseStage`, `loadServerConfig()`, `loadPublicConfig()`, `isSignupOpen()`.
- Consumers: all server composition, metadata, signup actions, launch ops, cron route.

- [ ] **Step 1: Write failing config tests**

Cover:

```ts
expect(parseReleaseStage('early-access')).toBe('early-access')
expect(parseReleaseStage('launched')).toBe('launched')
expect(() => parseReleaseStage('beta')).toThrow()
expect(() => loadServerConfig({ CORPUS_RELEASE_STAGE: 'launched', CORPUS_DOWNLOAD_URL: '' })).toThrow()
```

Also verify `CORPUS_DOWNLOAD_URL` must be HTTPS when launched.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
bunx vitest run src/config/server-env.test.ts
```

- [ ] **Step 3: Implement Zod-backed configuration**

Define:

```ts
export type ReleaseStage = 'early-access' | 'launched'

export interface ServerConfig {
  siteUrl: URL
  releaseStage: ReleaseStage
  downloadUrl: URL | null
  databaseUrl: string
  databaseUrlUnpooled: string
  recaptchaSecretKey: string | null
  recaptchaScoreThreshold: number
  resendApiKey: string | null
  emailFrom: string | null
  replyTo: string | null
  emailPostalAddress: string | null
  cronSecret: string | null
  launchDryRunRecipient: string | null
}
```

Do not expose server secrets through `NEXT_PUBLIC_*` variables. `RECAPTCHA_SITE_KEY` is the only CAPTCHA value required client-side.

- [ ] **Step 4: Add safe `.env.example` descriptions**

Include exactly the names from the specification, with non-secret descriptions and no real values.

- [ ] **Step 5: Add baseline security headers**

In `next.config.ts`, emit the production headers defined in the spec and a CSP whose third-party origins are limited to the exact Google reCAPTCHA origins needed by the chosen integration.

- [ ] **Step 6: Re-run tests and static checks**

```bash
bunx vitest run src/config/server-env.test.ts
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/config .env.example next.config.ts
git commit -m "feat: validate landing runtime configuration"
```

---

### Task 3: Model the early-access domain and repository contract

**Files:**
- Create: `src/core/entities/early-access-signup.ts`
- Create: `src/core/results/early-access-result.ts`
- Create: `src/core/errors/early-access-errors.ts`
- Create: `src/core/repositories/early-access-signup.repository.ts`
- Create: `src/core/ports/clock.port.ts`
- Create: `src/core/ports/token-generator.port.ts`
- Create: `src/core/ports/token-hasher.port.ts`
- Create: `src/core/testing/in-memory-early-access-signup.repository.ts`
- Create: `src/core/testing/fixed-clock.adapter.ts`
- Create: `src/core/testing/deterministic-token.adapter.ts`
- Create: `src/core/entities/early-access-signup.test.ts`

**Interfaces:**
- Produces: core entity and repository abstractions with no Drizzle types.

- [ ] **Step 1: Write failing entity lifecycle tests**

Test derived states:

```ts
expect(signup.isIdentifiable()).toBe(true)
expect(signup.isLaunchEligible()).toBe(true)
expect(unsubscribed.isLaunchEligible()).toBe(false)
expect(anonymized.isIdentifiable()).toBe(false)
```

- [ ] **Step 2: Define the entity**

Use explicit fields matching the spec:

```ts
export interface EarlyAccessSignup {
  id: string
  emailOriginal: string | null
  emailNormalized: string | null
  consentVersion: string
  consentedAt: Date
  createdAt: Date
  updatedAt: Date
  unsubscribedAt: Date | null
  anonymizedAt: Date | null
  manageTokenHash: string | null
  confirmationStatus: 'pending' | 'sent' | 'failed' | 'exhausted'
  confirmationAttemptCount: number
  confirmationLastAttemptAt: Date | null
  confirmationNextAttemptAt: Date | null
  confirmationSentAt: Date | null
  launchStatus: 'pending' | 'sending' | 'sent' | 'failed' | 'manual_review'
  launchAttemptCount: number
  launchLastAttemptAt: Date | null
  launchSentAt: Date | null
}
```

Derived subscription state must be computed from lifecycle facts rather than stored as a generic status.

- [ ] **Step 3: Define repository methods around domain language**

```ts
export interface EarlyAccessSignupRepository {
  findCurrentByNormalizedEmail(emailNormalized: string): Promise<EarlyAccessSignup | null>
  findByManageTokenHash(hash: string): Promise<EarlyAccessSignup | null>
  findById(id: string): Promise<EarlyAccessSignup | null>
  create(input: NewEarlyAccessSignup): Promise<EarlyAccessSignup>
  save(signup: EarlyAccessSignup): Promise<EarlyAccessSignup>
  findConfirmationsDue(at: Date, limit: number): Promise<EarlyAccessSignup[]>
  findLaunchEligible(limit: number, afterId?: string): Promise<EarlyAccessSignup[]>
  findPiiPurgeDue(at: Date, limit: number): Promise<EarlyAccessSignup[]>
  countLaunchEligible(): Promise<number>
}
```

- [ ] **Step 4: Implement in-memory repository and test doubles**

The in-memory implementation must enforce the same current-identifiable-email uniqueness rule used by PostgreSQL.

- [ ] **Step 5: Run tests**

```bash
bunx vitest run src/core/entities/early-access-signup.test.ts
bun run check
```

- [ ] **Step 6: Commit**

```bash
git add src/core
git commit -m "feat: model early access lifecycle"
```

---

### Task 4: Implement the Neon/Drizzle persistence adapter and generated migration

**Files:**
- Create: `src/adapters/db/schema/early-access-signups.ts`
- Create: `src/adapters/db/schema/index.ts`
- Create: `src/adapters/db/neon-database.adapter.ts`
- Create: `src/adapters/db/drizzle-early-access-signup.repository.ts`
- Create: `src/adapters/db/early-access-signup.mapper.ts`
- Create: `src/adapters/db/drizzle-early-access-signup.repository.integration.test.ts`
- Modify: `drizzle.config.ts`
- Create: generated `drizzle/*` migration files

**Interfaces:**
- Consumes: `EarlyAccessSignupRepository` and domain types from Task 3.
- Produces: `DrizzleEarlyAccessSignupRepository` returning only core entities.

- [ ] **Step 1: Write repository contract tests**

Run the same contract against the in-memory repository and the real Drizzle adapter. Cover create, lookup, save, unsubscribe/resubscribe state, anonymization, due-confirmation queries, launch eligibility, and uniqueness.

- [ ] **Step 2: Define Drizzle enums and table exactly from the spec**

Use PostgreSQL enums for confirmation and launch status and a UUID primary key.

- [ ] **Step 3: Add the partial unique index**

Equivalent SQL must be generated for:

```sql
unique(email_normalized)
where anonymized_at is null and email_normalized is not null
```

- [ ] **Step 4: Generate migration**

```bash
bun run db:generate
```

Inspect the generated SQL; do not hand-edit schema drift into production.

- [ ] **Step 5: Run migration against a disposable/local test database and contract suite**

```bash
DATABASE_URL_TEST="$DATABASE_URL_TEST" bun run db:migrate
bunx vitest run src/adapters/db/drizzle-early-access-signup.repository.integration.test.ts
```

- [ ] **Step 6: Run architecture/static checks**

```bash
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/adapters/db drizzle drizzle.config.ts
git commit -m "feat: persist early access signups"
```

---

### Task 5: Implement token generation, hashing, logging, and early-access composition providers

**Files:**
- Create: `src/adapters/security/node-token-generator.adapter.ts`
- Create: `src/adapters/security/sha256-token-hasher.adapter.ts`
- Create: `src/adapters/logging/pino-logger.adapter.ts`
- Create: `src/core/ports/logger.port.ts`
- Modify: `src/composition/capabilities/persistence.ts`
- Modify: `src/composition/capabilities/config-secrets.ts`
- Create/modify: `src/composition/server/early-access.ts`
- Create: unit tests for token/hash adapters

**Interfaces:**
- Produces: cryptographically random opaque tokens, SHA-256 hashes, PII-safe logging, and server composition dependencies.

- [ ] **Step 1: Write failing tests**

Assert generated tokens have sufficient entropy/length, the hash is deterministic, and logger helper rejects/redacts prohibited fields in structured metadata.

- [ ] **Step 2: Implement token generation**

Use `crypto.randomBytes(32).toString('base64url')` or equivalent Web/Node crypto with at least 256 bits of randomness.

- [ ] **Step 3: Implement hashing**

Use SHA-256 and return a lowercase hexadecimal digest. Never log input or output.

- [ ] **Step 4: Implement Pino adapter with an allowlisted metadata shape**

Allowed operational metadata is limited to signup UUID, operation, lifecycle/delivery state, error code, attempt count, aggregate count, and duration.

- [ ] **Step 5: Wire persistence/security providers only inside composition capabilities**

Do not construct adapters in use cases or feature UI.

- [ ] **Step 6: Verify**

```bash
bunx vitest run src/adapters/security
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/adapters src/core/ports src/composition
git commit -m "feat: add secure early access infrastructure"
```

---

### Task 6: Implement idempotent join and resubscribe use cases

**Files:**
- Create: `src/core/use-cases/join-early-access.use-case.ts`
- Create: `src/core/use-cases/resubscribe-early-access.use-case.ts`
- Create: `src/core/use-cases/join-early-access.use-case.test.ts`
- Create: `src/core/use-cases/resubscribe-early-access.use-case.test.ts`

**Interfaces:**
- Consumes: repository, clock, token generator, token hasher.
- Produces:

```ts
export interface JoinEarlyAccessInput {
  emailOriginal: string
  emailNormalized: string
  consentVersion: string
}

export interface JoinEarlyAccessOutput {
  signupId: string
  shouldSendConfirmation: boolean
  managementToken: string | null
}
```

Public boundaries must not expose whether the row was new, duplicate, or resubscribed.

- [ ] **Step 1: Write failing tests for new signup**

Assert one row is created, a token hash is stored, raw token is returned only to trusted orchestration for email rendering, and confirmation status starts `pending`.

- [ ] **Step 2: Write failing duplicate-active tests**

Assert the same normalized address creates no second row and, once confirmation is `sent`, `shouldSendConfirmation` is false.

- [ ] **Step 3: Write failing resubscribe tests**

Assert canonical row reuse, `unsubscribedAt` cleared, management token rotated, consent version/time refreshed, launch eligibility restored, and a new confirmation requested.

- [ ] **Step 4: Implement minimal use cases**

Normalize only at the boundary; the use cases receive both original/normalized values explicitly. Preserve original casing/spacing only after boundary trimming.

- [ ] **Step 5: Verify race handling path**

Add a test where repository create reports `PersistenceConflictError`; re-read the current row and return the same non-enumerating success semantics.

- [ ] **Step 6: Run tests**

```bash
bunx vitest run src/core/use-cases/join-early-access.use-case.test.ts src/core/use-cases/resubscribe-early-access.use-case.test.ts
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/core/use-cases
git commit -m "feat: add idempotent early access join"
```

---

### Task 7: Implement CAPTCHA port/adapters and signup Server Action

**Files:**
- Create: `src/core/ports/captcha-verifier.port.ts`
- Create: `src/adapters/captcha/google-recaptcha.adapter.ts`
- Create: `src/adapters/captcha/fake-captcha.adapter.ts`
- Create: `src/features/early-access/schemas/signup.schema.ts`
- Create: `src/features/early-access/backend/early-access-backend.ts`
- Create: `src/features/early-access/backend/local-early-access-backend.ts`
- Create: `src/features/early-access/actions/join-early-access.action.ts`
- Create: `src/features/early-access/early-access.wiring.ts`
- Add tests for adapter parsing and Server Action result mapping

**Interfaces:**
- Produces:

```ts
export interface CaptchaVerificationRequest {
  token: string
  action: 'early_access_signup'
}

export interface CaptchaVerificationResult {
  accepted: boolean
}
```

and public action states:

```ts
export type SignupActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'invalid-email'; message: string }
  | { status: 'retry'; message: string }
  | { status: 'closed' }
```

- [ ] **Step 1: Write failing signup action tests**

Cover valid signup, invalid syntax, CAPTCHA rejection, internal persistence failure, duplicate success, and launched-mode rejection.

- [ ] **Step 2: Implement Zod email parsing and normalization**

Trim email first and set `emailNormalized = trimmed.toLowerCase()`.

- [ ] **Step 3: Implement Google adapter**

Verify expected action, provider validity, threshold, and hostname/site data when available. Map every provider rejection to `accepted: false`; never return score to caller and never persist/log it.

- [ ] **Step 4: Implement deterministic fake adapter**

Use a fixed test token convention such as `test-pass`/`test-fail`; no network access.

- [ ] **Step 5: Implement the Server Action**

Order: schema parse → release-stage check → CAPTCHA verify → join use case → confirmation orchestration. Public duplicate/new distinction must collapse to the exact success copy in the spec.

- [ ] **Step 6: Verify**

```bash
bunx vitest run src/features/early-access src/adapters/captcha
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/features/early-access src/adapters/captcha src/core/ports/captcha-verifier.port.ts
git commit -m "feat: secure early access signup"
```

---

### Task 8: Implement confirmation email templates, delivery port, and retry semantics

**Files:**
- Create: `src/core/ports/email-sender.port.ts`
- Create: `src/adapters/email/resend-email-sender.adapter.ts`
- Create: `src/adapters/email/fake-email-sender.adapter.ts`
- Create: `src/adapters/email/templates/confirmation-email.tsx`
- Create: `src/adapters/email/templates/confirmation-email.text.ts`
- Create: `src/adapters/email/templates/email-shell.tsx`
- Create: `src/core/use-cases/send-confirmation-email.use-case.ts`
- Create: `src/core/use-cases/retry-failed-confirmations.use-case.ts`
- Create: render and use-case tests

**Interfaces:**
- `EmailSender.send()` must return one of `accepted`, `known_retryable_failure`, `known_terminal_failure`, `ambiguous` without leaking provider bodies.

- [ ] **Step 1: Write template render tests**

Assert exact subject, preheader, heading, commitment copy, `lucent` specimen, Capture/Enrich/Practice section, footer meaning, and `Manage early access` link label.

- [ ] **Step 2: Implement React Email template**

No Tailwind. Build email-safe table/layout primitives with inline styles and the approved paper/clay/night palette. Include dark-mode-compatible CSS where supported.

- [ ] **Step 3: Implement explicit plain text**

Do not derive plain text by stripping HTML. Render it from a dedicated function.

- [ ] **Step 4: Write failing delivery-state tests**

Known retryable failure: mark `failed`, increment attempts, schedule next daily run. Accepted: mark `sent`. Ambiguous: mark `exhausted`/non-retryable operational state immediately to avoid duplicate confirmation.

- [ ] **Step 5: Implement Resend adapter**

Set open tracking and click tracking disabled in provider configuration/API options where Resend exposes them. Do not log response bodies.

- [ ] **Step 6: Implement retry maximum of 3 attempts**

Attempt 1 is immediate; attempts 2 and 3 are due on later maintenance runs. After third known failure, status becomes `exhausted` while launch eligibility remains unaffected.

- [ ] **Step 7: Verify**

```bash
bunx vitest run src/adapters/email src/core/use-cases/send-confirmation-email.use-case.test.ts src/core/use-cases/retry-failed-confirmations.use-case.test.ts
bun run check
```

- [ ] **Step 8: Commit**

```bash
git add src/adapters/email src/core/ports/email-sender.port.ts src/core/use-cases
git commit -m "feat: send confirmation email safely"
```

---

### Task 9: Implement management-token resolution and explicit unsubscribe flow

**Files:**
- Create: `src/core/use-cases/unsubscribe-early-access.use-case.ts`
- Create: `src/core/use-cases/resolve-early-access-management.use-case.ts`
- Create: `src/features/early-access/actions/resolve-management.action.ts`
- Create: `src/features/early-access/actions/unsubscribe.action.ts`
- Create: `src/features/early-access/ui/manage-token-bridge.tsx`
- Create: `src/features/early-access/ui/manage-early-access.tsx`
- Create: `src/app/early-access/manage/page.tsx`
- Add unit/component/E2E tests

**Interfaces:**
- Management resolution accepts a raw token only as Server Action input and returns a masked-email state.

- [ ] **Step 1: Write failing use-case tests**

Cover active, already unsubscribed, invalid token, anonymized/invalidated token, and explicit unsubscribe.

- [ ] **Step 2: Implement email masking helper**

For `gonza@example.com`, render a pattern equivalent to `g***@example.com`. Never return full email to the client.

- [ ] **Step 3: Implement the fragment bridge**

On mount, read `window.location.hash`, immediately call `history.replaceState` to remove it from visible URL, then submit the token to the read-only resolve Server Action. Never send the raw token as path/query data.

- [ ] **Step 4: Implement explicit unsubscribe action**

A page load performs no mutation. Only the primary `Unsubscribe` control calls the mutation Server Action.

- [ ] **Step 5: Render exact public states**

Use the approved copy for active, unsubscribed, and invalid-link states.

- [ ] **Step 6: Verify**

```bash
bunx vitest run src/core/use-cases/unsubscribe-early-access.use-case.test.ts src/core/use-cases/resolve-early-access-management.use-case.test.ts
bunx playwright test tests/e2e/manage-early-access.spec.ts --project=chromium
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/core/use-cases src/features/early-access src/app/early-access
git commit -m "feat: add secure early access management"
```

---

### Task 10: Implement retention, anonymization, and Vercel Cron maintenance

**Files:**
- Create: `src/core/use-cases/purge-expired-signup-pii.use-case.ts`
- Create: `src/core/use-cases/purge-expired-signup-pii.use-case.test.ts`
- Create: `src/composition/server/maintenance.ts`
- Create: `src/app/api/cron/maintenance/route.ts`
- Create: route tests
- Modify: `vercel.json`

**Interfaces:**
- Produces aggregate counts only:

```ts
export interface MaintenanceResult {
  confirmationRetriesProcessed: number
  confirmationExhausted: number
  unsubscribedAnonymized: number
  launchedAnonymized: number
}
```

- [ ] **Step 1: Write failing purge tests**

Assert PII is removed 30 days after unsubscribe if not resubscribed and 30 days after `launchSentAt`. Clear `emailOriginal`, `emailNormalized`, `manageTokenHash`; set `anonymizedAt`; keep non-identifying lifecycle timestamps/counters.

- [ ] **Step 2: Implement purge use case**

No email hash may be retained.

- [ ] **Step 3: Write failing cron authorization tests**

Missing or incorrect `Authorization: Bearer <CRON_SECRET>` must reject. The response/body/logs must not contain email or token values.

- [ ] **Step 4: Wire maintenance orchestration**

Run due confirmation retries, exhausted transition handling, pre-launch unsubscribe anonymization, and post-launch-send anonymization.

- [ ] **Step 5: Configure daily Vercel Cron**

Add `/api/cron/maintenance` once daily in `vercel.json`.

- [ ] **Step 6: Verify**

```bash
bunx vitest run src/core/use-cases/purge-expired-signup-pii.use-case.test.ts src/app/api/cron/maintenance
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/core/use-cases src/composition/server src/app/api vercel.json
git commit -m "feat: automate early access maintenance"
```

---

### Task 11: Implement launch email rendering and per-recipient launch reliability

**Files:**
- Create: `src/adapters/email/templates/launch-email.tsx`
- Create: `src/adapters/email/templates/launch-email.text.ts`
- Create: `src/core/use-cases/send-launch-email.use-case.ts`
- Create: `src/core/use-cases/send-launch-email.use-case.test.ts`
- Create: `src/ops/launch-input.schema.ts`
- Create: `src/ops/render-launch-email.ts`

**Interfaces:**
- Release-specific input:

```ts
export interface LaunchEmailInput {
  releaseVersion: string
  releaseSummary: string
  includedFeatures: string[]
  knownLimitations: string[]
  downloadUrl: URL
}
```

No arbitrary HTML/body input.

- [ ] **Step 1: Write render tests**

Assert preserved hierarchy: `It's ready to try.`, `Get Corpus`, `In the first build`, `What isn't there yet`, reply/support statement, `Structure creates freedom.`, and Manage Early Access footer. Assert no Google Play hard-coding and no claim that access is tied to signup email.

- [ ] **Step 2: Implement React Email and text templates**

Use typed validated inputs only.

- [ ] **Step 3: Write launch-state tests**

Before provider call: set `sending`, increment attempt count, set attempt time. Accepted → `sent` and timestamp. Known failure → `failed`. Ambiguous → retain `sending` for idempotent rerun. After provider idempotency window expiry, orchestration changes `sending` to `manual_review` rather than resending.

- [ ] **Step 4: Use deterministic idempotency key**

Exactly:

```text
corpus-launch-v1/<signup-id>
```

- [ ] **Step 5: Verify**

```bash
bunx vitest run src/adapters/email/templates src/core/use-cases/send-launch-email.use-case.test.ts src/ops
bun run check
```

- [ ] **Step 6: Commit**

```bash
git add src/adapters/email/templates src/core/use-cases/send-launch-email.use-case.ts src/ops
git commit -m "feat: add idempotent launch email"
```

---

### Task 12: Implement launch dry-run and production-send operations plus GitHub workflow

**Files:**
- Create: `src/composition/ops/launch.ts`
- Create: `src/ops/launch-dry-run.ts`
- Create: `src/ops/launch-production.ts`
- Create: `.github/workflows/launch-email.yml`
- Add ops tests

**Interfaces:**
- Dry run and production consume the same validated release input/version fingerprint.

- [ ] **Step 1: Define a deterministic release-input fingerprint**

Canonicalize the validated input and SHA-256 it. Dry-run output records the fingerprint in a non-PII artifact so production can require the exact same release payload/version.

- [ ] **Step 2: Write dry-run tests**

Assert it validates production stage, HTTPS destination, eligible count, final HTML/text rendering, sends only to `LAUNCH_DRY_RUN_RECIPIENT`, and performs zero subscriber launch-state mutations.

- [ ] **Step 3: Write production-run tests**

Assert production rejects if no matching dry-run fingerprint is supplied; processes only eligible rows; uses single-run cursor/batch semantics; and logs UUID/state only.

- [ ] **Step 4: Implement ops composition separately from web composition**

`src/composition/ops/launch.ts` may construct long-lived DB/email adapters for the CLI lifetime but must reuse the same core use cases/adapters.

- [ ] **Step 5: Implement the workflow**

Use `workflow_dispatch`, `launch-production` environment, single-run concurrency, environment-scoped secrets, and required reviewer where the repository/account supports it. Keep release-specific content as typed workflow inputs or a committed typed JSON file that validates against the schema; never accept arbitrary HTML.

- [ ] **Step 6: Verify locally with fake adapters**

```bash
bunx vitest run src/ops src/composition/ops
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/ops src/composition/ops .github/workflows/launch-email.yml
git commit -m "feat: gate the one-time launch send"
```

---

### Task 13: Snapshot approved Corpus brand assets and build the static landing shell

**Files:**
- Create: `public/brand/corpus-mark.svg`
- Create: additional approved icons/assets required by the landing
- Create: `src/features/landing/content/landing-content.ts`
- Create: `src/features/landing/ui/corpus-mark.tsx`
- Create: `src/features/landing/ui/site-header.tsx`
- Create: `src/features/landing/ui/hero.tsx`
- Create: `src/features/landing/ui/progress-spine.tsx`
- Create: `src/features/landing/ui/site-footer.tsx`
- Create/modify: `src/app/page.tsx`, `src/app/layout.tsx`, `src/features/landing/landing.css`
- Add component/render tests

**Interfaces:**
- Consumes: authoritative `corpus-landing-lexicon.html` and main Corpus brand assets.
- Produces: semantic static shell with no unnecessary client hydration.

- [ ] **Step 1: Copy the approved vector mark into this repo**

Snapshot the canonical mark from main Corpus. Record its source commit/path in `docs/context/brand-snapshot.md`; do not import it at runtime from another repository.

- [ ] **Step 2: Define typed static content**

Move approved landing copy/demo content into typed constants without rewriting it.

- [ ] **Step 3: Implement fonts with `next/font/google`**

Use Newsreader + Karla with local build output and no runtime Google Fonts request.

- [ ] **Step 4: Implement semantic static shell**

Preserve sticky header, hero structure, section order, mark treatment, paper/ink/clay palette, fluid type/spacing, progress spine, and footer.

- [ ] **Step 5: Add skip link, landmarks, visible focus states, and semantic heading order**

These are required even before motion is added.

- [ ] **Step 6: Verify server rendering and no Tailwind utility translation**

```bash
bunx vitest run src/features/landing
bun run build
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add public/brand src/features/landing src/app docs/context/brand-snapshot.md
git commit -m "feat: build corpus landing shell"
```

---

### Task 14: Translate the approved GSAP choreography into bounded interactive islands

**Files:**
- Create: `src/features/landing/motion/hero-motion.tsx`
- Create: `src/features/landing/motion/scrollytelling-motion.tsx`
- Create: `src/features/landing/motion/shared-motion.ts`
- Create: `src/features/landing/ui/capture-enrich-practice.tsx`
- Modify: `src/features/landing/landing.css`
- Add motion/unit/E2E tests

**Interfaces:**
- Client components own only browser-only GSAP orchestration; content/structure stay server-rendered.

- [ ] **Step 1: Add E2E assertions for progressive enhancement and reduced motion before implementation**

With JS disabled or motion disabled, all essential content remains readable and navigable. With `prefers-reduced-motion: reduce`, transitions do not carry essential meaning.

- [ ] **Step 2: Implement hero geometry and typed `lucent` demonstration**

Match the approved prototype choreography and timing intent. Do not invent new motion.

- [ ] **Step 3: Implement Capture → Enrich → Practice scrollytelling**

Keep keyboard/scroll behavior from the prototype and bound observers/listeners to the island lifecycle.

- [ ] **Step 4: Implement shared magnetic/parallax behavior only where present in the source prototype**

No second animation framework.

- [ ] **Step 5: Verify desktop/mobile and reduced-motion behavior**

```bash
bunx playwright test tests/e2e/landing-motion.spec.ts --project=chromium
bunx playwright test tests/e2e/landing-motion.spec.ts --project=webkit
bun run check
```

- [ ] **Step 6: Commit**

```bash
git add src/features/landing tests/e2e/landing-motion.spec.ts
git commit -m "feat: reproduce corpus landing motion"
```

---

### Task 15: Implement Living Lexicon, cloze, philosophy inversion, and responsive behavior

**Files:**
- Create: `src/features/landing/ui/living-lexicon.tsx`
- Create: `src/features/landing/ui/living-lexicon.client.tsx`
- Create: `src/features/landing/ui/cloze-demo.tsx`
- Create: `src/features/landing/ui/philosophy-section.tsx`
- Create: `src/features/landing/content/demo-lexicon.ts`
- Modify: `src/features/landing/landing.css`
- Add unit/E2E tests

**Interfaces:**
- Static demo content is typed in-repo; no Neon/CMS reads.

- [ ] **Step 1: Write keyboard and interaction acceptance tests first**

Cover Living Lexicon click, keyboard navigation, drag, autoplay pause/control semantics, and screen-reader state updates.

- [ ] **Step 2: Implement Living Lexicon browser**

Preserve approved demo vocabulary and encounter-story intent exactly.

- [ ] **Step 3: Implement cloze interaction**

Keep the demo deterministic and client-local; do not call product APIs.

- [ ] **Step 4: Implement philosophy theme inversion**

Match the prototype contrast/palette transition without changing document semantics.

- [ ] **Step 5: Match responsive breakpoints/intent from prototype**

Test desktop, narrow mobile, Chrome Android emulation, and Safari iOS emulation.

- [ ] **Step 6: Verify**

```bash
bunx playwright test tests/e2e/living-lexicon.spec.ts tests/e2e/cloze.spec.ts
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/features/landing tests/e2e
git commit -m "feat: add living lexicon interactions"
```

---

### Task 16: Implement release-aware CTA surfaces and the early-access form UI

**Files:**
- Create: `src/features/early-access/ui/signup-form.tsx`
- Create: `src/features/early-access/ui/recaptcha-bridge.tsx`
- Create: `src/features/early-access/ui/early-access-section.tsx`
- Create: `src/features/landing/ui/release-cta.tsx`
- Modify: `src/features/landing/ui/hero.tsx`
- Modify: `src/features/landing/ui/site-header.tsx`
- Modify: `src/features/early-access/early-access.css`
- Add component/E2E tests

**Interfaces:**
- Consumes: `ReleaseStage`, signup Server Action, public reCAPTCHA site key.

- [ ] **Step 1: Write exact-copy tests for early-access mode**

Assert hero/header `Join early access`, bottom section eyebrow/heading/body/CTA/consent, invalid-email copy, generic retry copy, and exact success copy.

- [ ] **Step 2: Implement accessible form state**

Use associated label, email autocomplete, status region with appropriate `aria-live`, disabled/submitting state, and no enumeration-specific response.

- [ ] **Step 3: Integrate client CAPTCHA bridge only in production**

Preview/local/test use the fake verifier path and do not load Google network scripts.

- [ ] **Step 4: Write launched-mode tests**

Assert hero/header become `Get Corpus`, private-development note becomes launch/platform copy from the approved prototype/spec source, bottom signup form/consent disappears, and CTA points to validated `CORPUS_DOWNLOAD_URL`.

- [ ] **Step 5: Verify stale-client rejection**

The Server Action must return closed state after release-stage switch even if a cached client still submits.

- [ ] **Step 6: Run tests**

```bash
bunx playwright test tests/e2e/signup.spec.ts tests/e2e/launched-mode.spec.ts --project=chromium
bun run check
```

- [ ] **Step 7: Commit**

```bash
git add src/features/early-access src/features/landing tests/e2e
git commit -m "feat: add release-aware early access CTA"
```

---

### Task 17: Implement legal pages, SEO, social preview, analytics, and environment indexing rules

**Files:**
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/opengraph-image.tsx`
- Create: `src/components/legal-page.tsx`
- Modify: `src/app/layout.tsx`
- Add metadata/robots/E2E tests

**Interfaces:**
- Consumes: `SITE_URL`, release stage, deployment environment.

- [ ] **Step 1: Write privacy-content assertions from actual behavior**

Document collected email/consent/lifecycle data, Neon/Resend/Google/Vercel processors, 30-day anonymization rules, unsubscribe/resubscribe, Vercel Web Analytics/Speed Insights, no sale/marketing reuse, and no email tracking.

- [ ] **Step 2: Write concise product-specific terms**

Cover pre-release status, no release-date guarantee, changing features/availability, early-build defects, platform/distribution constraints, abuse prohibition, and configured legal/contact details.

- [ ] **Step 3: Implement canonical metadata and stage-aware product wording**

Never infer trusted origins from request headers; use `SITE_URL` only.

- [ ] **Step 4: Implement indexing rules**

Production: `index, follow`. Preview/local/test: `noindex, nofollow` plus robots crawl block.

- [ ] **Step 5: Implement deterministic 1200×630 social card**

Paper background, canonical mark, restrained axis/diamond motif, `Corpus`, `Learn words from real life.`, ink + clay. No screenshot, stock image, or AI artwork.

- [ ] **Step 6: Add Vercel Analytics and Speed Insights only**

Do not add conversion events or behavioral analytics.

- [ ] **Step 7: Verify**

```bash
bunx playwright test tests/e2e/legal-seo.spec.ts
bun run build
bun run check
```

- [ ] **Step 8: Commit**

```bash
git add src/app src/components
git commit -m "feat: add legal and seo surfaces"
```

---

### Task 18: Build the full Playwright, axe, and Lighthouse acceptance gates

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/homepage.spec.ts`
- Create: `tests/e2e/signup.spec.ts`
- Create: `tests/e2e/manage-early-access.spec.ts`
- Create: `tests/e2e/launched-mode.spec.ts`
- Create: `tests/e2e/legal-seo.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/preview-safety.spec.ts`
- Create: `lighthouserc.cjs`

**Interfaces:**
- Produces the exact critical acceptance matrix required by the spec.

- [ ] **Step 1: Configure projects**

Chromium full suite; Firefox/WebKit smoke/critical interactions; mobile Chrome and mobile Safari emulation.

- [ ] **Step 2: Implement the full required scenario matrix**

Cover homepage render, hero, anchors, sticky header, progress spine, scrollytelling, Living Lexicon click/keyboard/drag, autoplay controls, cloze, philosophy inversion, mobile, reduced motion, all signup/error/duplicate/resubscribe cases, confirmation-failure semantics, launched mode, management fragment removal/masking/unsubscribe/invalid states, privacy/terms, preview indexing, and fake email/CAPTCHA enforcement.

- [ ] **Step 3: Add axe assertions**

Run axe on homepage, manage active, manage unsubscribed, Privacy, and Terms. Fail on serious/critical WCAG findings unless a documented false positive is proven.

- [ ] **Step 4: Configure Lighthouse CI**

Mobile, 3 runs, median thresholds:

```text
Performance     >= 0.90
Accessibility   >= 0.95
Best Practices  >= 0.95
SEO             >= 0.95
```

- [ ] **Step 5: Run locally against production build**

```bash
bun run build
bun run start
bun run e2e
bunx lhci autorun
```

Expected: all gates pass.

- [ ] **Step 6: Commit**

```bash
git add tests playwright.config.ts lighthouserc.cjs
git commit -m "test: cover corpus landing acceptance matrix"
```

---

### Task 19: Implement CI, disposable Neon branches, preview deployment, E2E, and Lighthouse workflows

**Files:**
- Create/modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/preview.yml`
- Create/modify: `.github/workflows/e2e.yml`
- Create: `.github/workflows/lighthouse.yml`
- Create: `.github/workflows/preview-cleanup.yml` if cleanup cannot live safely in `preview.yml`
- Create: `docs/operations/preview-ci.md`

**Interfaces:**
- Produces stable check names exactly: `check`, `test`, `preview`, `e2e`, `lighthouse`.

- [ ] **Step 1: Implement `check`**

Frozen Bun install, typecheck, Biome, dependency-cruiser, Claude Stack conformance.

- [ ] **Step 2: Implement `test`**

Create disposable Neon `ci-<run-id>-<attempt>` branch from `development`, migrate, run Vitest/repository/email/domain tests, always cleanup.

- [ ] **Step 3: Implement `preview`**

Create/reuse disposable Neon `pr-<number>` from `development`, migrate, deploy Vercel Preview with fake email/CAPTCHA and noindex, output preview URL, cleanup on PR close.

- [ ] **Step 4: Implement `e2e`**

Run Playwright against the preview URL and never real production services.

- [ ] **Step 5: Implement `lighthouse`**

Run LHCI against preview, no self-hosted LHCI server.

- [ ] **Step 6: Pin all actions to full commit SHAs**

Use official Neon Actions and current Claude Stack pinning guidance.

- [ ] **Step 7: Verify workflow syntax and local gates**

```bash
bun run check
bun run test
```

Inspect YAML for exact job/check names and `always()` cleanup behavior.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows docs/operations/preview-ci.md
git commit -m "ci: add isolated preview quality gates"
```

---

### Task 20: Implement explicit production stage/smoke/promote deployment and rollback documentation

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Create: `src/ops/production-smoke.ts` or shell-equivalent checked into `scripts/`
- Create: `docs/operations/production-deploy.md`
- Create: `docs/operations/rollback.md`

**Interfaces:**
- Production deployment accepts an exact `main` SHA and promotes the already-built staged deployment after smoke verification.

- [ ] **Step 1: Encode exact-SHA validation**

Workflow dispatch input must equal event/live `main` SHA before migration/deploy and be rechecked immediately before promote.

- [ ] **Step 2: Run production migration with unpooled URL**

Use `DATABASE_URL_UNPOOLED` and generated Drizzle migrations only.

- [ ] **Step 3: Stage Vercel production deployment without domain promotion**

Build once, capture deployment identifier/URL, and do not attach the production domain yet.

- [ ] **Step 4: Smoke test staged deployment**

Check homepage, release-stage CTA, health of static assets, security headers, robots/indexing, and one non-mutating server boundary. Do not create a real signup in the smoke test.

- [ ] **Step 5: Reverify `main` SHA and zero-rebuild promote**

Abort if `main` moved.

- [ ] **Step 6: Document rollback**

Rollback is promotion of a previous known-good Vercel deployment; migration discipline is expand → deploy → contract, so rollback does not assume destructive schema reversal.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy-production.yml src/ops docs/operations
git commit -m "ci: add gated production deployment"
```

---

### Task 21: Public-repository hardening, branch policy, and final documentation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `docs/architecture.md`
- Create: `docs/operations/launch-email.md`
- Create: `docs/operations/privacy-retention.md`
- Modify: `.gitignore`, `.claude/protected-files.txt`, `CLAUDE.md`

**Interfaces:**
- Produces safe public documentation with no secrets/PII and clear operator instructions.

- [ ] **Step 1: Add MIT license and concise public README**

Explain product purpose, architecture, local fake-service defaults, configuration variable names, tests, and deployment model without exposing sensitive values.

- [ ] **Step 2: Document architecture boundaries**

Explicitly show `core ← adapters ← composition`, web vs ops composition, and no public signup REST API.

- [ ] **Step 3: Document launch-email operator runbook**

Dry run → verify fingerprint/count/render → protected production send → manual review handling. Never instruct operators to bypass idempotency/manual-review safeguards.

- [ ] **Step 4: Document retention/privacy operations**

Include 30-day rules and exact anonymized fields.

- [ ] **Step 5: Scan repository for prohibited data patterns**

Search for email-like fixtures, raw connection strings, `RESEND_API_KEY=`, `RECAPTCHA_SECRET_KEY=`, `DATABASE_URL=postgres`, and token-shaped samples. Replace with safe placeholders/fakes.

- [ ] **Step 6: Configure GitHub repository settings after remote creation**

Public repo `GonzaOrtega/corpus-landing`, only long-lived `main`, squash merge only, PR required, checks `check`, `test`, `preview`, `e2e`, `lighthouse`, branch current with base, conversations resolved, force-push/deletion disabled, bypass disabled where GitHub Free supports it.

- [ ] **Step 7: Commit**

```bash
git add README.md LICENSE SECURITY.md docs .gitignore .claude CLAUDE.md
git commit -m "docs: harden corpus landing for public release"
```

---

### Task 22: Final verification against the Definition of Done

**Files:**
- Create: `docs/verification/definition-of-done.md`
- No production code should be changed unless a verification failure reveals a defect.

**Interfaces:**
- Produces final evidence mapping each spec Definition-of-Done item to an automated or manual check.

- [ ] **Step 1: Run clean install and all static gates**

```bash
rm -rf node_modules .next
bun install --frozen-lockfile
bun run check
```

Expected: stack conformance, typecheck, Biome, and dependency rules green.

- [ ] **Step 2: Run unit/integration tests on a disposable Neon branch**

```bash
bun run db:migrate
bun run test
```

Expected: domain, repository, email render, retry, retention, management, launch idempotency tests green.

- [ ] **Step 3: Run full browser suite**

```bash
bun run build
bun run e2e
```

Expected: Chromium full critical suite plus Firefox/WebKit/mobile smoke green.

- [ ] **Step 4: Run accessibility gate**

Ensure axe suite is part of Playwright and record results for homepage, manage active/unsubscribed, Privacy, Terms.

- [ ] **Step 5: Run Lighthouse CI**

```bash
bunx lhci autorun
```

Expected median thresholds meet or exceed spec.

- [ ] **Step 6: Verify PII/log safety**

Exercise signup, confirmation failure, manage, maintenance, dry run, and fake production launch paths while capturing logs. Confirm no email, raw token/hash, CAPTCHA token/score, provider response body, DB URL, or secret appears.

- [ ] **Step 7: Verify preview isolation**

Prove preview uses its own Neon branch, fake email, fake CAPTCHA, noindex/robots block, and cleanup.

- [ ] **Step 8: Verify launch reliability manually with fakes**

Prove dry-run fingerprint gate, accepted send, known failure, ambiguous rerun with same idempotency key, and expired ambiguity → `manual_review` without automatic resend.

- [ ] **Step 9: Verify release-stage transition**

Run both `early-access` and `launched` builds/configurations and verify the only changed public surfaces are the CTA/private-development/early-access surfaces described by the spec.

- [ ] **Step 10: Perform manual visual QA against all three authoritative HTML references**

Compare desktop/mobile layout, typography, mark, color, spacing, motion choreography, email hierarchy, dark-mode email behavior, keyboard behavior, and reduced-motion behavior. Fix only implementation drift; do not redesign.

- [ ] **Step 11: Record Definition-of-Done evidence**

Create a 26-row checklist matching specification section 39, each with command/workflow/manual-evidence pointer and pass/fail state. No item may be marked pass without evidence.

- [ ] **Step 12: Run the verification-before-completion Superpower skill**

Do not claim completion before the final clean verification outputs are read and confirmed.

- [ ] **Step 13: Commit verification documentation**

```bash
git add docs/verification/definition-of-done.md
git commit -m "docs: record corpus landing verification"
```

---

## Plan Self-Review

### Spec coverage

This plan maps all major specification areas to tasks:

- Claude Stack/new project/architecture/dependencies: Tasks 1–5.
- Release configuration/security headers: Task 2.
- Data model/persistence/idempotency: Tasks 3–6.
- CAPTCHA/signup: Task 7.
- Confirmation email/retries: Task 8.
- Management/unsubscribe/resubscribe: Tasks 6 and 9.
- Retention/cron: Task 10.
- Launch email/dry-run/idempotency/workflow: Tasks 11–12.
- Landing visuals/GSAP/Living Lexicon: Tasks 13–15.
- Early-access vs launched surfaces: Task 16.
- Legal/SEO/social/analytics: Task 17.
- Browser/a11y/Lighthouse: Task 18.
- CI/preview/Neon isolation: Task 19.
- Production deployment/rollback: Task 20.
- Public-repo security/docs/Git model: Task 21.
- Full Definition of Done/manual visual QA: Task 22.

### Placeholder scan

No implementation step relies on `TBD`, `TODO`, arbitrary body HTML, or unspecified product behavior. Deployment-time values intentionally unresolved by the design remain environment variables rather than plan gaps.

### Type consistency

The plan consistently uses `EarlyAccessSignup`, `EarlyAccessSignupRepository`, `ReleaseStage`, `CaptchaVerifier`, `EmailSender`, `JoinEarlyAccessInput/Output`, `LaunchEmailInput`, and the specified confirmation/launch status unions across tasks.

---

## Execution Order

Execute Tasks 1 → 22 sequentially. TDD applies to every behavior task. Commit after each task, do not push repeatedly just to trigger CI, and open the first implementation PR only after the local born-green baseline and the initial vertical slice are coherent enough for review. Once a PR exists, use its required checks and review feedback as the next gates.
