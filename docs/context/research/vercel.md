# Vercel — GitHub Actions deploy automation

checked-on: 2026-09-08
Versions observed in repo: `vercel` CLI pinned `59.11.7` (this is the current
npm `latest`, published 2026-09-04 — repo is on the newest release).
`next@16.3.4`. Hobby plan, team `Gonzalo's projects`.

## Q1 verdict — project-scoped token + CLI (the blocker)

**A project-scoped Vercel token cannot currently drive `vercel pull`,
`vercel build`, or `vercel promote` in CI. Only `vercel deploy` (incl.
`--prebuilt`) was built to tolerate it.** This is not stated anywhere in
Vercel's prose docs — verified by reading the CLI source
(vercel/vercel, `packages/cli`, branch `main`, essentially identical to
59.11.7 given the release-date proximity):

- `commands/deploy/index.ts` calls `ensureLink(..., { allowOwnerLookupFallback: true, ... })`.
  The option's own doc-comment in `util/link/ensure-link.ts` reads: *"Deploy-only
  fallback for project-scoped tokens that can fetch the linked project, but
  cannot fetch the owner user/team resource."*
- `commands/pull/index.ts` and `commands/build/index.ts` call `ensureLink()`
  **without** that option.
- `commands/promote/index.ts` → `request-promote.ts` → `get-project-by-deployment.ts`
  calls `getScope(client)`, which unconditionally calls `getUser(client)` (a
  user-level resource) with no try/catch fallback.
- `util/projects/link.ts`: when the owner/org lookup 403s with
  `code === 'forbidden' | 'team_unauthorized'` and no fallback is allowed, it
  throws exactly: `"Could not retrieve Project Settings. To link your
  Project, remove the .vercel directory and deploy again."` — the literal
  string the repo hit. This throws **identically** whether VERCEL_ORG_ID/
  VERCEL_PROJECT_ID are set, wrong, or omitted, because the org lookup itself
  (not the ID values) is what 403s for a project-scoped token. That explains
  the "byte-identical" observation.
- The docs (`/docs/accounts/access-tokens`) do confirm project scope "denies
  any request to... a user-level resource, or a team-level resource" — the
  CLI-source finding is just where that documented restriction actually bites.

**Practical conclusion**: a team-scoped token (not full-account) is genuinely
required for this repo's `pull`→`build`→`deploy --prebuilt`→(prod: `promote`)
sequence as implemented today. Team scope is still meaningfully narrower than
a full-account token (can't touch other teams), and Vercel's own
`vercel tokens add --project <id>` / dashboard project-scope feature is real
but presently only fully usable for the `deploy` step alone.

## Q2 — CLI-driven vs Git integration, still current in 2026

Vercel's own docs (`/docs/git/vercel-for-github`, updated 2026-08-11) present
the exact `vercel pull` → `vercel build [--prod]` → `vercel deploy --prebuilt
[--prod]` sequence as the current, supported "Using GitHub Actions" pattern —
no official Vercel-maintained Action; it's literally `npm install --global
vercel` + raw CLI calls in a workflow step. That matches this repo's
approach.

The Git integration cannot run arbitrary steps (e.g. Neon branch + migration)
*before* its own build — there's no pre-build hook, only "Ignored Build Step"
(skip/don't-skip a build). So disabling `git.deploymentEnabled` and driving
everything from Actions remains the only way to sequence
create-branch→migrate→build→deploy. This is inference from what capabilities
*are* documented (no pre-build hook exists), not a doc stating the negative.

If the Git integration *were* enabled, current guidance is to react to
deployments via `repository_dispatch` (`vercel.deployment.success` etc.), not
`deployment_status` — Vercel explicitly documents migrating away from
`deployment_status` for cost/complexity. Not applicable here since Git
integration is off, but worth knowing if that ever changes.

## Q3 — Deployment protection bypass for Playwright/Lighthouse

`x-vercel-protection-bypass` header + `VERCEL_AUTOMATION_BYPASS_SECRET`
("Protection Bypass for Automation") is the current, documented, **all-plans**
mechanism (`/docs/deployment-protection/automated-agent-access`, updated
2026-08-21) — this is exactly what the repo already wired. Add
`x-vercel-set-bypass-cookie: true` on the first request if Playwright
navigates in-browser after the initial load (subsequent navigations don't
resend custom headers otherwise) — check if `bun run e2e`'s Playwright config
already sets this.
No OIDC/"Trusted Sources" mechanism exists for this use case in current docs
— `VERCEL_OIDC_TOKEN` is for Vercel Functions authenticating *outbound* to
AWS/GCP at runtime, unrelated to CI bypassing protection on a preview.
`vercel curl` also handles the bypass automatically, but isn't needed here
since Playwright/Lighthouse already set the header directly.
Deployment Protection *Exceptions* (making a domain fully public) requires
Enterprise or Pro+Advanced Deployment Protection — not available/needed on
Hobby; bypass-secret is the right (and only free-tier) choice.

## Q4 — Production promotion shape

Build-once → `deploy --prebuilt --prod --skip-domain` → smoke → `vercel
promote` (staged-deployment pattern) is still the current documented safe
release shape (`/docs/deployments/promoting-a-deployment`, updated
2026-06-26: "Staging and promoting a production deployment... won't trigger a
rebuild"). Rolling Releases do **not** supersede it — Rolling Releases are
**Pro/Enterprise only** ("Pro teams can use Rolling Releases for one
project"), unavailable on this repo's Hobby plan, and are an orthogonal
traffic-splitting feature, not a replacement for stage/promote. No documented
Hobby restriction on `promote` or `--skip-domain` specifically — but per Q1,
`vercel promote` will hit the same project-scoped-token 403 as `pull`/`build`.

## Q5 — Other deprecated/better-supported items

- No official Vercel-maintained GitHub Action exists or is recommended; raw
  CLI-in-workflow (what's already used) is Vercel's own documented pattern.
- `vercel.ts` (programmatic TS config, `/docs/project-configuration/vercel-ts`,
  updated 2026-08-25) is new but **optional** — "Use only one configuration
  file: vercel.ts or vercel.json." `vercel.json` is not deprecated; migrate
  only if dynamic/programmatic config is needed. The repo's `vercel.json` is
  fully static (framework, commands, regions, cleanUrls, crons,
  `git.deploymentEnabled: false`) — no reason to change it.
- No OIDC-based CI→Vercel authentication exists to replace `VERCEL_TOKEN`;
  long-lived tokens remain the documented mechanism.

## Sources

- https://vercel.com/docs/accounts/access-tokens
- https://vercel.com/docs/cli/tokens
- https://vercel.com/changelog/project-scoped-tokens
- https://vercel.com/docs/cli/global-options
- https://vercel.com/docs/cli/pull / /docs/cli/link
- https://vercel.com/kb/guide/using-vercel-cli-for-custom-workflows
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/deployment-protection/automated-agent-access
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
- https://vercel.com/docs/deployments/promoting-a-deployment
- https://vercel.com/docs/rolling-releases
- https://vercel.com/docs/project-configuration/vercel-ts
- vercel/vercel GitHub source (packages/cli/src/util/projects/link.ts,
  util/link/ensure-link.ts, util/get-scope.ts, commands/{pull,build,deploy,
  promote}/index.ts, commands/promote/request-promote.ts,
  util/projects/get-project-by-deployment.ts) — read directly, not prose docs.
- github.com/vercel/vercel/issues/10874 (misleading error), #16073
  (env-var inconsistency across commands, same root pattern)
