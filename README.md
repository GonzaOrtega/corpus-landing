# Corpus Landing

Corpus Landing is the public release surface for **Corpus**, an Android-first
language-learning product. It explains the product, collects and confirms
early-access signups, lets subscribers manage or revoke consent, sends a
one-time launch notification, and switches to a download call to action when
the product launches.

The current implementation includes the landing experience, accessible motion
and interaction fallbacks, signup and self-service management, confirmation and
launch email delivery, privacy maintenance, isolated preview CI, and an
explicit production release/rollback path.

## Contents

- [Release stages](#release-stages)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Database schema and migrations](#database-schema-and-migrations)
- [Deployment and operations](#deployment-and-operations)
- [Architecture decision records](#architecture-decision-records)
- [Known limitations](#known-limitations)
- [Security and privacy](#security-and-privacy)
- [Changelog](#changelog)

## Release stages

Validated server configuration selects one of two stages:

| Stage | Public behavior |
| --- | --- |
| Early access | Shows the signup form, accepts signups, and links the primary call to action to that form. |
| Launched | Removes and rejects signup, then links the primary call to action to the configured HTTPS download destination. |

The rest of the landing experience is shared by both stages.

## Architecture

The dependency direction is `core ← adapters ← composition`. The core owns
entities, ports, repository contracts, and use cases; adapters implement those
ports; composition is the only layer that constructs concrete adapters.

Browser signup and management use Next.js Server Actions. There is
deliberately **no public signup REST API**. The only API route is the
production-only, bearer-authorized maintenance endpoint used by Vercel Cron.
Launch email is a separate human-gated operations composition root and cannot
be reached from the public web application.

See [Architecture](docs/architecture.md) for diagrams, request paths, and
boundary details.

## Getting started

Prerequisites:

- Bun 1.3.13
- a Neon non-production database when exercising persistence
- Chromium dependencies installed by Playwright when running browser tests

Install and prepare local configuration:

```bash
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill the required entries in `.env.local` using approved local secrets. Use
the stable Neon `development` branch for local database work; never use the
production branch. Apply committed migrations, then start Next.js:

```bash
bun run db:migrate
bun run dev
```

Local, test, and Preview web/maintenance flows select deterministic,
non-network fake email and CAPTCHA adapters automatically. Those flows do not
need Resend or Google credentials and cannot send email or call reCAPTCHA. The
privileged launch operations are the intentional exception: their separate
operations composition constructs the real email adapter, including when run
locally, and a dry run sends only to `LAUNCH_DRY_RUN_RECIPIENT` as described in
[the launch runbook](docs/operations/launch-email.md). Persistence is not faked:
flows that touch signup data still require an isolated or development database.

## Environment variables

Only variable names and purposes belong in Git. Do not commit values,
connection strings, account identifiers, subscriber data, or raw tokens.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SITE_URL` | Server | Canonical site origin used for links and metadata. |
| `CORPUS_RELEASE_STAGE` | Server | Selects the early-access or launched behavior. |
| `CORPUS_DOWNLOAD_URL` | Server | HTTPS destination required by the launched stage. |
| `DATABASE_URL` | Server | Pooled application database connection. |
| `DATABASE_URL_UNPOOLED` | Server/automation | Direct database connection used by migrations. |
| `DATABASE_URL_TEST` | Test tooling | Optional isolated integration-test connection. |
| `RECAPTCHA_SITE_KEY` | Public configuration | The only CAPTCHA value allowed to reach the browser in Production. |
| `RECAPTCHA_SECRET_KEY` | Secret | Server-side Production CAPTCHA verification credential. |
| `RECAPTCHA_SCORE_THRESHOLD` | Server | Score threshold for Production CAPTCHA verification. |
| `RESEND_API_KEY` | Secret | Production email-provider credential. |
| `EMAIL_FROM` | Server | Verified sender identity. |
| `REPLY_TO` | Server | Reply address for transactional mail. |
| `EMAIL_POSTAL_ADDRESS` | Server | Postal address rendered in email. |
| `CRON_SECRET` | Secret | Bearer credential for the maintenance route. |
| `LAUNCH_DRY_RUN_RECIPIENT` | Secret | Approved recipient for launch-email review. |
| `MANAGEMENT_TOKEN_SECRET` | Secret | Server-only key for deterministic launch management tokens. |

Automation also uses scoped Vercel and Neon identifiers and tokens described
in the linked operations runbooks. `.env.example` is a names-and-descriptions
contract; real values belong in local secret storage, Vercel environment
settings, or protected GitHub Environments.

## Testing

```bash
bun run check       # Next.js types, TypeScript, Biome, architecture conformance
bun run test        # Vitest unit, component, and integration suites
bun run e2e         # Playwright browser flows
bun run lighthouse  # Lighthouse CI against the configured URL
```

Pull requests expose five stable required checks: `check`, `test`, `preview`,
`e2e`, and `lighthouse`. CI and Preview use disposable Neon branches; email and
CAPTCHA remain fake. See [Preview CI operations](docs/operations/preview-ci.md).

## Database schema and migrations

The single `early_access_signups` table records consent and delivery lifecycle
facts. Identifying columns are nullable so retention maintenance can anonymize
the row without discarding non-identifying consent and delivery evidence.

| Area | Columns |
| --- | --- |
| Identity | `id`, `email_original`, `email_normalized`, `manage_token_hash` |
| Consent and retention | `consent_version`, `consented_at`, `created_at`, `updated_at`, `unsubscribed_at`, `anonymized_at` |
| Confirmation delivery | `confirmation_status`, attempt count, last/next attempt timestamps, sent timestamp |
| Launch delivery | `launch_status`, attempt count, last-attempt timestamp, sent timestamp |

A partial unique index permits only one current, non-anonymized row per
normalized email. There is no redundant overall subscription status; current
state is derived from lifecycle facts.

The Drizzle schema is
[`src/adapters/db/schema.ts`](src/adapters/db/schema.ts), and generated
migrations are committed under [`drizzle/`](drizzle/0000_curly_ares.sql).
Change the schema, generate a migration with `bun run db:generate`, review the
SQL, and apply it with `bun run db:migrate`. Do not use schema push or hand-edit
a production database. Production changes follow expand → deploy → contract so
traffic can roll back without destructive down migrations.

## Deployment and operations

Merging to `main` does not deploy Production. Vercel Git deployment is disabled;
an operator dispatches the production workflow for an exact live `main` SHA.
It migrates through the direct database connection, builds once, stages without
the public domain, runs smoke checks, revalidates `main`, and promotes that same
artifact.

- [Preview CI and disposable database branches](docs/operations/preview-ci.md)
- [Production deployment](docs/operations/production-deploy.md)
- [Production rollback](docs/operations/rollback.md)
- [Launch email](docs/operations/launch-email.md)
- [Privacy and retention](docs/operations/privacy-retention.md)
- [Branch protection](docs/operations/branch-protection.md)

`main` is the only long-lived Git branch. Before public release, repository
settings must require pull requests, a current branch, resolved conversations,
the five checks above, squash-only merges, and disabled force-push, deletion,
and bypass where supported. The checked-in policy is documentation; applying
or verifying those GitHub settings is a separate privileged operation.

## Architecture decision records

### ADR-001: Hexagonal boundaries with separate composition roots

**Status:** Accepted

**Date:** 2026-09

**Context:** Public requests, scheduled maintenance, and the one-time launch
send share domain behavior but have different credentials and risk profiles.

**Decision:** Keep business rules in a framework-independent core, implement
technology ports in adapters, and construct them only in web or operations
composition roots. Use Server Actions for signup and management instead of a
public signup REST endpoint.

**Consequences:** Core behavior is testable with deterministic adapters;
Production integrations fail closed; privileged launch wiring stays outside
the request path. Composition has more explicit wiring, but environment and
credential boundaries remain visible.

## Known limitations

- There is no dedicated rate-limit service in v1; Production abuse protection
  relies on score-based reCAPTCHA and generic failure responses.
- Local signup and integration flows require access to the stable Neon
  `development` branch; only email and CAPTCHA have local fake adapters.
- Fork pull requests cannot receive deployment credentials, so Preview, E2E,
  and Lighthouse gates fail closed until run from a trusted branch.
- An ambiguous launch delivery older than the provider idempotency window is
  intentionally moved to `manual_review`; the system will not risk an
  automatic resend.
- Production is deployed in one configured Vercel region and has no automated
  multi-region failover.

## Security and privacy

Never put credentials, connection strings, subscriber data, raw management
tokens, provider response bodies, or other PII in Git, logs, fixtures,
workflows, screenshots, or artifacts. See [SECURITY.md](SECURITY.md) for private
vulnerability reporting and [the privacy runbook](docs/operations/privacy-retention.md)
for retention behavior.

## Changelog

All notable changes are recorded here in a Keep a Changelog-compatible format.

### [Unreleased]

#### Added

- Complete public landing, signup, management, email, maintenance, Preview CI,
  production deployment, rollback, architecture, and operator documentation.

#### Security

- Full-history secret scanning, disposable non-production databases,
  fake non-production email/CAPTCHA adapters, and public-release hardening.

## License

[MIT](LICENSE) © 2026 Gonzalo Ortega
