# Preview CI operations

The six stable PR checks are `check`, `test`, `preview`, `e2e`,
`preview-smoke`, and `lighthouse`. They use ordinary `pull_request` events
only; no workflow uses `pull_request_target`.

## What runs where

E2E runs in a container image this repo owns (`docker/e2e.Dockerfile`), built
locally by `bun run test:e2e` and published to GHCR for the CI `e2e` job. The
image supplies the same bun, Playwright, browser, and system-library versions in
both environments. That is why WebKit works locally despite the host lacking
its system libraries, and why screenshot baselines are comparable between a
laptop and the runner.

`playwright.config.ts` builds and serves a local production build inside that
container when `PLAYWRIGHT_BASE_URL` is unset. E2E therefore does not depend on
`preview` and starts immediately. This is deliberate: pointing 65 tests at a
deployment made every action a network round-trip and, with Playwright's single
CI worker and two retries, projected to roughly twenty minutes per PR.

Regenerate visual baselines **inside the image**, never on the host:

    docker compose run --rm e2e sh -c "bun install --frozen-lockfile && bun tests/e2e/support/migrate.mjs && bunx playwright test --update-snapshots --grep-invert @preview"

E2E uses a local Postgres reached through a Neon HTTP proxy, so the production
driver is unchanged and no Neon branch is consumed. `ci.yml`'s `test` job keeps
using Neon, where pooled-versus-unpooled behaviour is the thing under test.

`preview-smoke` is the only check that exercises the deployed artifact. It runs
just the `@preview`-tagged tests — the ones whose assertions are meaningless
anywhere else, such as the deployed robots policy. Keep that set small; add a
test there only when a local build genuinely cannot answer the question.

The `e2e` job waits for its local proxy and applies migrations through that
proxy before Playwright starts. It runs the E2E migration support module, not
`db:migrate`, so the migration follows the same Neon HTTP driver path as the
application.

## Required GitHub configuration

Add the repository variable `NEON_PROJECT_ID` and these repository secrets:

- `NEON_API_KEY` — limited to the dedicated Corpus Landing Neon project;
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` — a least-privilege
  token and the linked Preview project identifiers.

The GHCR package `corpus-landing-e2e` must grant this repository read access so
the `e2e` job can authenticate its job-container pull with `GITHUB_TOKEN`.

Never add a production connection URL, Resend credential, CAPTCHA credential,
or production management secret to these workflows.

## Required Vercel Preview configuration

In Vercel Project Settings, set these values in the **Preview** scope only:

- `CORPUS_RELEASE_STAGE=early-access`;
- any other non-production configuration required by the build.

Do **not** set `SITE_URL` in the Preview scope. Each preview derives its own
origin from `VERCEL_URL`, so it is canonical for itself; a fixed value there
made every preview advertise the production origin as its canonical and hand
out management links pointing at production.

Variables read while prerendering must **not** be marked Sensitive. Sensitive
values are write-only, so `vercel pull` receives the literal `[SENSITIVE]` and
the CI build validates that string instead of the value — `SITE_URL` fails as
an invalid URL, `CORPUS_RELEASE_STAGE` throws out of `parseReleaseStage`, and
`REPLY_TO`/`EMAIL_POSTAL_ADDRESS` render literally on the legal pages. None of
those is a secret; all of them are published in the page or its emails. Real
secrets are read at runtime by the composition root, never through
`vercel pull`, so they stay Sensitive.

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

`preview` creates or reuses `pr-<number>` from `development`, then explicitly
refreshes that branch's expiration to seven days from the current workflow run
through Neon's branch-update API. This refresh is required because the pinned
create-branch action returns an existing named branch without updating its
original `expires_at`. The workflow then migrates the branch with the direct
URL and deploys the Preview runtime with the pooled URL. The rolling seven-day
expiration guards against abandoned or interrupted PR workflows, while
`Preview cleanup` deletes the deterministic branch promptly when the PR closes
without checking out PR code.

Generated database URLs are masked before use, remain in their originating
job, and are never job outputs or artifacts. Only the non-secret Vercel Preview
URL crosses jobs as the `preview` job output to the dependent `preview-smoke`
and `lighthouse` jobs in the same `pull_request` workflow. Neither CI nor
Preview connects to Neon `main` or production resources.

## Forks and browser gates

For same-repository PRs, GitHub supplies the scoped Vercel and Neon secrets and
the preview pipeline runs normally. Fork PRs retain all six check names, but
deployment-dependent checks and E2E fail closed. This preserves the security
boundary without reporting successful validation that did not run.

`preview-smoke` and Lighthouse depend on the successful `preview` job, validate
its HTTPS URL output, and point their runners at that Preview. E2E is independent
and tests the local production build. Lighthouse uses its existing
temporary-public-storage upload target; there is no self-hosted or paid LHCI
service.

The Lighthouse job sets `LHCI_DEPLOYMENT_ENV=preview` to exclude only
`is-crawlable`, which would penalize Preview's required noindex policy. All
category thresholds remain enforced: performance >=0.90, accessibility,
best practices, and SEO >=0.95. Preview E2E explicitly requires `Disallow: /`
and `noindex, nofollow` metadata. Default/Production Lighthouse runs retain
`is-crawlable`; setting a remote `LHCI_URL` alone does not exclude it. To audit
a local non-production build with the Preview policy, also set
`LHCI_DEPLOYMENT_ENV=preview`. The Production release smoke separately requires
index/follow metadata and an allow-all robots policy with the production
sitemap before promotion; verify indexing headers on the public domain after
promotion as described in [production-deploy.md](production-deploy.md).

## Operating notes

Vercel CLI is intentionally pinned to `59.11.7` in CI. `vercel.json` sets
`git.deploymentEnabled=false`, disabling automatic Vercel Git deployments.
GitHub Actions owns deployment: this Preview workflow deploys PRs, and the
manual `Deploy production` workflow releases an explicitly selected live-main
SHA through the protected `production` environment. Merging to `main` does not
deploy Production. Follow [production-deploy.md](production-deploy.md) to
configure the required external protections, stage, smoke-test, and promote
the same Production artifact. Keep automatic Git deployments disabled so
Actions remains the sole deployment owner.
