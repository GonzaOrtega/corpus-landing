# Preview CI operations

The five stable PR checks are `check`, `test`, `preview`, `e2e`, and
`lighthouse`. They use ordinary `pull_request` events only; no workflow uses
`pull_request_target`.

## Required GitHub configuration

Add the repository variable `NEON_PROJECT_ID` and these repository secrets:

- `NEON_API_KEY` — limited to the dedicated Corpus Landing Neon project;
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` — a least-privilege
  token and the linked Preview project identifiers.

Never add a production connection URL, Resend credential, CAPTCHA credential,
or production management secret to these workflows.

## Required Vercel Preview configuration

In Vercel Project Settings, set these values in the **Preview** scope only:

- `CORPUS_RELEASE_STAGE=early-access`;
- a valid non-production `SITE_URL`;
- any other non-production configuration required by the build.

Enable Vercel's automatically exposed system environment variables. The
deployed Preview receives `VERCEL_ENV=preview`; the application consequently
uses its fake email and CAPTCHA adapters and serves noindex robots/sitemap
metadata. Do not set `VERCEL_ENV` manually, and do not supply real Resend or
reCAPTCHA credentials to Preview.

## Database lifecycle and isolation

`test` creates `ci-<run-id>-<attempt>` from Neon `development`, applies
migrations using the direct `db_url`, runs Vitest with the pooled URL, and
deletes the branch in an `always()` cleanup step. A one-day expiration is an
independent fallback if a runner is terminated before cleanup.

`preview` creates or reuses `pr-<number>` from `development`, migrates it with
the direct URL, and deploys the Preview runtime with the pooled URL. Its
seven-day expiration guards against interrupted workflows. `Preview cleanup`
deletes the deterministic branch on PR close without checking out PR code.

Generated database URLs are masked before use, remain in their originating
job, and are never job outputs or artifacts. Only the non-secret Vercel Preview
URL crosses jobs as a one-day artifact for the E2E and Lighthouse workflows.
Neither CI nor Preview connects to Neon `main` or production resources.

## Forks and browser gates

For same-repository PRs, GitHub supplies the scoped Vercel and Neon secrets and
the preview pipeline runs normally. Fork PRs retain all five check names but
skip authenticated database/deployment work: unit tests run without a database,
and Preview, E2E, and Lighthouse report a safe no-op. This preserves the
security boundary while keeping branch-protection contexts stable.

E2E and Lighthouse start only after the successful Preview workflow, download
the URL artifact, validate that it is HTTPS, and point their runners at that
Preview. Lighthouse uses its existing temporary-public-storage upload target;
there is no self-hosted or paid LHCI service.

## Operating notes

Vercel CLI is intentionally pinned to `59.11.7` in CI. This task does not
change Vercel Git integration or any production deployment setting. If an
operator later changes Git integration, they must separately verify the
production deployment procedure and ensure only one preview deployer is active.
