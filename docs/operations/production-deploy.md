# Explicit production release

Merging to `main` never deploys production. `.github/workflows/deploy-production.yml`
has only `workflow_dispatch`, and `vercel.json` disables Vercel Git deployments.
The separate Preview workflow owns PR deployments. This workflow releases the
**launched** site: smoke requires the rendered **Get Corpus** download CTA.

## Prerequisites (operator configuration)

Before the first dispatch, configure the GitHub **production** environment with
required human reviewers, prevent self-review, restrict deployment branches to
`main`, and disallow protection bypass where the plan supports it. Naming an
environment in YAML does not create reviewer protection; verify these settings
in GitHub before use. This implementation does not change external settings.
Keep the required branch checks in [branch-protection.md](branch-protection.md).

In that protected environment, set:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `VERCEL_TOKEN` | CLI deployment authorization |
| Secret | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Production project identity |
| Secret | `DATABASE_URL_UNPOOLED` | Production Neon direct connection for generated migrations |
| Secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | Protection bypass for the staged URL, if deployment protection is enabled |
| Variable | `PRODUCTION_SITE_URL` | Expected canonical HTTPS site origin, matching Vercel `SITE_URL` |
| Variable | `PRODUCTION_DOWNLOAD_URL` | Expected launched HTTPS download destination, matching Vercel `CORPUS_DOWNLOAD_URL` |

The Vercel project's **Production** environment must contain the application's
complete server configuration, including `CORPUS_RELEASE_STAGE=launched`,
`CORPUS_DOWNLOAD_URL`, `SITE_URL`, and both database URLs. Its unpooled database
must be the same production database as the GitHub migration secret. Set
`CRON_SECRET` for actual scheduled maintenance; the smoke never uses it. Keep
Vercel system environment variables enabled so Production metadata sees
`VERCEL_ENV=production`. No Edge runtime is introduced: use default Node.js /
Fluid Compute. Follow [preview-ci.md](preview-ci.md) for preview isolation.

Store no tokens or database URLs in commits, dispatch inputs, screenshots,
artifacts, or release notes. Do not enable shell tracing or upload `.vercel`,
pulled environment files, or raw migration output. The workflow suppresses
driver output because connection failures can contain connection strings.

## Release procedure

1. Check that required checks passed for the exact commit now at live `main`.
   Confirm all pending migrations are reviewed, generated Drizzle migrations
   and are backward compatible with the current deployment. Do not use schema
   push or generate migrations in CI.
2. Record the current known-good Production deployment's immutable URL or ID,
   commit, and release time in the release record. Retain it for
   [rollback](rollback.md); for a first release record that no previous target
   exists.
3. Open **Actions → Deploy production → Run workflow**, select `main`, and
   supply its full lowercase 40-hex SHA as `sha`. Approve the protected
   environment only after reviewing that specific SHA and migration set.
4. Observe the run. It validates the input against the authoritative GitHub
   `git/ref/heads/main` API, checks out that immutable SHA with checkout
   credentials disabled, and checks the live ref again immediately before
   migration/build. An empty, stale, malformed, or unreadable ref fails closed.
5. The migration runs `bun run db:migrate` with `DATABASE_URL_UNPOOLED`.
   `vercel@59.11.7` then pulls **Production**, builds **once** with `build
   --prod`, and uploads that output with `deploy --prebuilt --prod --skip-domain`.
   No production domains are assigned at this stage. The workflow captures
   the generated deployment URL directly from the CLI and waits for READY
   using `inspect --wait --timeout=10m`.
6. The smoke script checks that same immutable URL. Only after success does
   the workflow query live `main` again, immediately followed by `vercel
   promote` of the same URL. There is no second build. Record the resulting
   commit and deployment from the Actions summary with the known-good target.
7. Verify the public production domain, its canonical URL, indexing headers,
   and operational signals after promotion. Keep the prior deployment until
   the release is stable and the rollback window has passed.

Production runs share `corpus-production-release` concurrency with
`cancel-in-progress: false`; an in-flight migration/release is not canceled by
a newer dispatch. GitHub may replace older pending runs with newer queued
runs; each run still validates its requested SHA. If `main` moves, dispatch
again for the new live SHA after its checks pass. If smoke fails, do not
manually promote the failed staged deployment. Expanded migrations may already
be applied and must remain compatible with the serving application.

GitHub ref comparison and Vercel promotion are separate operations. `main` can
move in the small interval after the last comparison. Coordinate the release
window through branch/reviewer policy if that residual race is unacceptable;
the workflow cannot provide a transaction across the two services.

## Smoke contract

Run `bun src/ops/production-smoke.ts` with `DEPLOY_URL`, `SMOKE_SITE_URL`,
`SMOKE_DOWNLOAD_URL`, and optional `VERCEL_AUTOMATION_BYPASS_SECRET` supplied
through the environment. `--validate` checks configuration without requests.
The script fails on errors, redirects, unexpected statuses/types, or timeouts.
It never follows links to the download site or forwards bypass headers there.

| Request | Required evidence |
| --- | --- |
| `GET /` | 200 HTML, Corpus heading, launched download link matching the expected destination, production CSP/HSTS and other configured security headers, `index, follow` metadata, correct canonical origin |
| Referenced `/_next/static/…css` | Same deployment origin, 200 CSS, nonempty CSS content |
| `GET /robots.txt` | 200 text, wildcard user agent allowed `/`, production sitemap URL |
| `GET /api/cron/maintenance` | Exactly 401 with body `Unauthorized`, with no Authorization header |

The last check exercises the existing server composition and authorization
boundary. The handler rejects the request before `maintenance.execute`, so it
does not retry emails, purge subscribers, submit signup, or require a real
management token. It is not a database read/write probe or a full dependency
health check. There is no `/api/health` route.

Indexing assertions apply to the application's HTML and robots.txt. Vercel can
add `X-Robots-Tag: noindex` to URLs without production aliases; that platform
header on the staged URL is allowed. Check the actual production domain after
promotion to ensure it is indexable. Do not weaken application metadata checks
or attach the domain early to work around staging behavior.

Vercel documents the [staged Production promotion without a rebuild](https://vercel.com/docs/deployments/promoting-a-deployment),
[generated URL capture](https://vercel.com/docs/deployments/generated-urls),
and [platform robots response header](https://vercel.com/docs/headers/response-headers).
Promoting Preview may rebuild for Production; a Preview artifact is not a
substitute for this workflow's prebuilt staged Production artifact.
