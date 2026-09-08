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
URL crosses jobs as the `preview` job output to the dependent E2E and Lighthouse
jobs in the same `pull_request` workflow. Neither CI nor Preview connects to
Neon `main` or production resources.

The E2E job independently reuses the deterministic `pr-<number>` branch to
obtain a masked pooled connection string for its management-flow fixture. This
keeps dynamic database URLs inside the job that consumes them instead of passing
them through the Preview job output.

## Forks and browser gates

For same-repository PRs, GitHub supplies the scoped Vercel and Neon secrets and
the preview pipeline runs normally. Fork PRs retain all five check names, but
database/deployment-dependent checks fail closed because their required
credentials are unavailable. This preserves the security boundary without
reporting successful validation that did not run.

E2E and Lighthouse depend on the successful `preview` job, validate its HTTPS
URL output, and point their runners at that Preview. Lighthouse uses its
existing temporary-public-storage upload target; there is no self-hosted or
paid LHCI service.

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
