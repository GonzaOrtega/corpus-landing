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

Before Lighthouse measures a Preview, its job makes two authenticated warm-up
requests. They use Vercel Automation Bypass so Vercel Authentication cannot
turn either request into a login page. The direct probes do not request a bypass
cookie: Vercel creates that cookie through a redirect, which would loop when
`curl` follows redirects. Lighthouse retains its cookie header for its separate
follow-up resource requests. The warm-up request also does not follow redirects,
so a Preview response cannot forward the bypass secret to another host.

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
uses its fake CAPTCHA adapter and serves noindex robots/sitemap metadata. Do
not set `VERCEL_ENV` manually, and do not supply real reCAPTCHA credentials to
Preview.

Do **not** set `CORPUS_FAKE_CAPTCHA` in Vercel. `VERCEL_ENV=preview` already
selects the fake, and Production refuses to start when the flag is present. The
flag exists only for hosts where `VERCEL_ENV` is absent — the E2E container and
the local Playwright run set it explicitly — because selecting a CAPTCHA-free
signup form from that absence alone would leave any non-Vercel deployment open,
paired with the real Resend sender whenever those variables are configured.

Preview email is deliberately different. Supply Preview-scoped
`RESEND_API_KEY`, `EMAIL_FROM`, `REPLY_TO`, and `EMAIL_POSTAL_ADDRESS` for a
sender domain reserved for Preview, never the Production one, and Preview will
send real confirmation mail from it. Omit them and Preview falls back to the
non-network fake. Preview databases are disposable branches of `development`,
so the recipients are that branch's rows.

This does not extend to CI. The `test` and `e2e` jobs never send, whatever
credentials the checkout carries: `src/composition/capabilities/notifications.ts`
excludes them by explicit signal (`CI`, `NODE_ENV=test`, or
`E2E_NEON_HTTP_ENDPOINT`) rather than by absent configuration, because
`compose.yaml` bind-mounts the repository into the E2E container.

## Database lifecycle and isolation

`test` creates `ci-<run-id>-<attempt>` from Neon `development`, applies
migrations using the direct `db_url`, runs Vitest with coverage using the
pooled URL (`bun run test:coverage`, which fails the job below any per-layer
threshold in `vitest.config.ts`), and deletes the branch in an `always()`
cleanup step. A one-day expiration is an independent fallback if a runner is
terminated before cleanup.

Coverage runs here and nowhere else in CI, because this is the only job with a
database: every other run excludes the Drizzle repository, whose suite
self-skips without one. `bun run check` runs the same gate locally, so a
breached threshold normally fails before the push and this job is the backstop
rather than the first warning. Nothing uploads the HTML report, so a CI-only
breach is read from the job log. See "Measuring the Drizzle repository" in
[Testing](../quality/testing.md) to reproduce this job's measurement.

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
the preview pipeline runs normally - with one exception. A Dependabot-triggered
run reads from the *Dependabot* secret store rather than the Actions store, so
those secrets are empty even though the branch is in this repository and no fork
guard trips; see [Dependency updates](#dependency-updates). Fork PRs retain all
six check names, but deployment-dependent checks and E2E fail closed. This
preserves the security boundary without reporting successful validation that did
not run.

`e2e` is the one gate that needs no deployment credential — its database is a
throwaway Postgres container, not Neon — so it fails closed by an explicit fork
guard rather than by absent secrets. It does need read access to the shared
runner image, and the `corpus-landing-e2e` GHCR package is **deliberately
private** even though the repository is public: `e2e` already refuses to run for
fork PRs, so publishing the image would grant access without enabling anything.
The image itself holds no secrets, so it can be published later if outside
contributors ever need to pull the same runner locally.

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

Before collecting Lighthouse samples, the job makes two successful, retrying
GET requests to the same verified Preview URL. This warms the fresh deployment
without changing the three-run collection, optimistic aggregation, or category
thresholds. A warm-up failure fails the required `lighthouse` job rather than
allowing Lighthouse to report a score for an unavailable deployment.

## Dependency updates

Dependabot proposes; a maintainer adopts. Neither half is optional, for two
independent reasons:

| Blocker | Cause | Fix |
| --- | --- | --- |
| Frozen install fails | Dependabot updates `package.json` and never `bun.lock`. Twelve install sites are frozen, including `vercel.json`'s `installCommand`, which `vercel build` runs twice per pipeline. | `bun install` on the branch, committed. |
| Credentials are empty | A Dependabot-triggered run reads the *Dependabot* secret store, not the Actions store. The runner logs `Secret source: Dependabot`. | A maintainer pushes the branch and becomes the triggering actor. |

Measured on the first Dependabot run in this repository: all six gated checks
failed at `bun install --frozen-lockfile` before reaching a gate, and
`gitleaks` - which needs no secrets - was the only green check. `preview` never
even reached the step that reads `VERCEL_*`, so the frozen-install blocker fully
masks the secret blocker. After adoption all seven checks passed. Seven green
checks are not the same as a mergeable pull request; see [Merging an adopted
branch](#merging-an-adopted-branch).

The lockfile half is permanent, not a bug to wait out. The Dependabot update job
log shows the `npm_and_yarn` ecosystem shelling out to npm:

```text
npm install <pkg>@<version> --package-lock-only --dry-run=true --ignore-scripts
```

`--package-lock-only` writes `package-lock.json`, and this repository has only
`bun.lock`, so nothing is written. Regenerating or normalising `bun.lock` does
not change this, and no Dependabot setting exists to make npm emit a bun
lockfile.

To adopt a branch:

```bash
bun run deps:adopt dependabot/npm_and_yarn/<branch-name>
git push origin adopt/dependabot/npm_and_yarn/<branch-name>:dependabot/npm_and_yarn/<branch-name>
```

`deps:adopt` refuses a dirty tree, syncs the lockfile, re-runs a frozen install
to prove it settled, then runs `check` and `test`. Pass `--push` to have it push
for you. If a linter minor reformats files, run `bun run format` and include the
result in the same commit so no intermediate commit leaves `check` red.

`main` requires branches to be up to date before merging, and `deps:adopt`
branches straight off the Dependabot ref without consulting `main`. When the bot
branch is behind, merge `main` into the adopt branch before pushing:

```bash
git merge origin/main --no-edit
```

Merge rather than rebase. A rebase rewrites the branch, which turns the adoption
push into a force-push for no gain, and the merge commit is squashed away at the
end regardless.

Pushing to a Dependabot branch permanently stops Dependabot from managing that
pull request. That is the intent, not a side effect.

`.github/dependabot.yml` groups every npm update into a single weekly pull
request for this reason: the cost is one adoption per PR, not per dependency.

### Merging an adopted branch

Green checks do not make an adopted branch mergeable. `main` requires code owner
review and `.github/CODEOWNERS` assigns `*` to the repository owner, so a
Dependabot-authored pull request needs an approval recorded against it:

```bash
gh pr review <n> --approve
```

No other pull request in this repository reaches that rule. Every one of them is
authored by the owner, who cannot be asked to review their own work, so the
requirement is satisfied with no review on record. A bot-authored branch is the
only case where author and code owner differ, and GitHub then requests the
review for real. `enforce_admins` is on, so there is no bypass.

PR #13, the first adoption, merged on 2026-09-10 with no review on record; the
protection settings in force that day were not captured, so this may simply have
been tightened since. PR #18 was the first adoption to meet the rule, and sat at
`BLOCKED` with all seven checks green until it was approved. Either way the rule
applies now, and a green branch that will not merge is this step, not a flake.

### Upgrading Playwright

`@playwright/test` is on Dependabot's ignore list because its version is
load-bearing in three places that must agree, and
`tests/unit/e2e-runtime-config.test.ts` asserts they do. Because that test
forces all three to move in one commit, the branch's `e2e` job will fail until
the image exists - publish it before re-running the job:

1. `bun add -d @playwright/test@<version>`, which also syncs `bun.lock`.
2. In the same commit, move the tag in **both** `docker/e2e.Dockerfile` (the
   upstream `mcr.microsoft.com/playwright` base) and `.github/workflows/preview.yml`
   (the published `corpus-landing-e2e` image).
3. Push the branch, then run the `E2E image` workflow via `workflow_dispatch`
   **targeting that branch**. It derives the tag from the branch's
   `package.json` and builds from the branch's Dockerfile. On `push` it is
   restricted to `main`, because the tag is shared and mutable.
4. Re-run the `e2e` job, which can now pull the image it references.

Publishing from a side branch overwrites the tag every other branch pulls, so do
it deliberately and land the change on `main` promptly.

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
