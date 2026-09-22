# Definition-of-Done evidence — 2026-09-07

This records specification §39 in its original order. Initial verification
baseline: `454d4877ede963cfe792c648d693ed9a4a3244d8`; fix round 1 starts from
`d6f0b9e12df2ac5fee55f41d6a90efab5e67801c`. E1–E7 preserve the initial evidence;
E8 records fix round 1; E9 corrects its typography finding and supersedes its
font solution and affected verification results. Fix round 2 starts from `0f309fb`.
E10 records the final workflow/config and documentation corrections from `1100946`.
E11 re-runs every locally reproducible gate at `3cff40e` (six commits past the
initial baseline) ahead of the public-visibility flip, and supersedes the
Playwright, axe, repository-integration and manage-flow results of E1–E10.
E13 records the coverage gate introduced on 2026-09-20 (row 5a) and re-runs the
locally reproducible gates with it in place.
The release is **not verified complete**: the remaining gaps are deployment- and
provider-dependent, not local.

PASS means the stated local scope was observed. FAIL means observed contrary
evidence. PENDING means required evidence is unavailable or incomplete; local
fakes never establish a remote deployment or database result. Email reference
and dark-mode defects are fixed in local renders; actual email-client checks
remain pending. The approved landing contrast exception does not turn axe green.

| # | Specification requirement | State | Evidence and remaining boundary |
| --- | --- | --- | --- |
| 1 | stack conformance green | FAIL | E11 unchanged: `bun run check` exits 0 and the audit JSON still has zero RED with `ciRed:[]`, but the verdict remains `standard:false` / `NOT STANDARD (v4)` on the same five YELLOW findings (config-secrets detection, adapter naming, no Vercel link, no seed script, missing overview/concepts docs). The rule is unchanged, so the row stays FAIL by its own definition rather than by any new regression. |
| 2 | typecheck green | PASS | E11: `next typegen && tsc --noEmit`, exit 0. |
| 3 | Biome green | PASS | E11: `biome check .` — 187 files, no fixes and no warnings. |
| 4 | dependency rules green | PASS | E11: `bunx depcruise --config .dependency-cruiser.json src app`, no violations. |
| 5 | Vitest green | PASS | E11: 258 tests passed across 49 files. One file — the real-Postgres repository integration suite — is skipped without `DATABASE_URL`; it is run separately and passes in row 6. |
| 5a | Vitest coverage gate green | PASS | E13: `bun run test:coverage` without `DATABASE_URL` - 562 tests across 94 files (one integration file skipped), every per-glob threshold met, exit 0. Enforced thresholds (lines/branches/functions/statements): core 100/100/100/100; adapters 100/92/100/99; composition 98/100/93/98; config 99/97/100/98; ops 95/90/100/95; features 88/89/86/87; components 100/100/100/100; `app/**` 93/94/80/93; `proxy.ts` 100/97/100/100. Gate proven to bite: merging `main` into this branch put the Sentry observability files inside these globs for the first time and the same run exited non-zero with eight `ERROR: Coverage for ... does not meet ... threshold` lines, against config, features and `app/**`. The floors above are the re-measurement that followed; every agreed target still holds. `app/error.tsx` and `app/global-error.tsx` sit at 50% each because the uncovered half is a client component's JSX body, which needs the jsdom layer this repo declined; they are left measured rather than excluded, because the `browserOnly` list requires an e2e spec per entry and none exercises the error boundary. Remaining boundary: the local run excludes the Drizzle repository (its suite self-skips without a database) and reports the exclusion; the adapters floor was set from that file's DB-free unit measurement (100/85/100/98), a lower bound on what a run with a database measures with the integration suite on top. The gate runs in `bun run check` and in the required CI `test` check, which has a database and therefore measures the Drizzle repository; verified against a local Postgres through the documented recipe at 573 tests across 95 files, no skips, exit 0, `src/adapters/db` at 98.38/92.68/100/100. Nothing uploads the report. See `docs/quality/testing.md`. |
| 6 | repository integration green on disposable Neon | PASS | E11 supersedes the earlier PENDING. `drizzle-early-access-signup.repository.integration.test.ts` ran against the disposable containerized PostgreSQL 17 through the local Neon HTTP proxy — the same `drizzle-orm/neon-http` driver production uses — after `migrate.mjs` applied both committed migrations: 10 tests passed, including the partial-unique-index contract and the non-conflict driver-error sanitization case. Remaining boundary: this is real PostgreSQL, not a Neon branch, so Neon-specific pooling and branch lifecycle behaviour is still unproven here (rows 10 and 25 own that). |
| 7 | Playwright green | PASS | E11 supersedes E9's 42/9. The containerized runtime (`bun run test:e2e`) runs the full matrix green: **64 passed** in 33.4s across chromium (50), firefox (3), webkit (3), mobile-chrome (4) and mobile-safari (4). E9's two failure classes are both resolved: the image ships the WebKit host libraries, and the DB-backed management journey now runs against the container's Postgres. The homepage contrast exception is no longer a Playwright failure either — see row 8. |
| 8 | axe green | PASS | E11 supersedes E3. `accessibility.spec.ts` runs axe on homepage, Privacy and Terms and asserts zero `serious` or `critical` violations — all three pass, so E3's serious homepage `color-contrast` violation is gone. Remaining boundary unchanged: the active and unsubscribed Manage pages still carry no axe assertions. |
| 9 | Lighthouse green | PASS | E9 stands. E12 re-measures after removing the duplicated motion root: performance 0.93 / 0.92 / 0.92 (median 0.92 ≥ 0.90), accessibility 0.95, best practices 0.96, SEO 1.00 every run, `lhci assert` exits 0. The material change is the spread, 0.09 → 0.01, and the worst run, 0.85 → 0.92. Local measurements on a host also running a dev server; no remote Preview measurement claimed. |
| 10 | preview isolation proven | PENDING | E6 source inspection plus E10's migration-environment test stand. E11 adds observed remote evidence — the `preview` job (Neon branch create, migrate, Vercel build/deploy) has completed green on every pull request through #8, and `preview-cleanup` green on close — but this row asks for an authenticated readback of the branch lifecycle, which was not gathered. PENDING. |
| 11 | no real preview email/CAPTCHA | PENDING | E2 composition/fake-CAPTCHA tests and E3 local no-CAPTCHA-script/noindex check pass. `src/composition/server/early-access.test.ts` verifies environment adapter selection. E12 makes the fake an explicit opt-in wherever `VERCEL_ENV` is absent, so a non-Vercel host fails closed instead of serving a CAPTCHA-free form; 13 cases in `external-api.test.ts` cover it, and neutralising the guard was confirmed to fail exactly the two off-Vercel cases. Actual Vercel Preview configuration and provider inactivity remain unverified. |
| 12 | idempotent production signup | PASS | E11 supersedes the earlier PENDING for the database half. The partial unique index is now exercised against real PostgreSQL by row 6's contract run, which covers duplicate canonical rows and the create-race recovery path, so partial-index concurrency is no longer inferred from an in-memory repository. Remaining boundary: end-to-end signup against the production database is still deployment work (row 25). |
| 13 | confirmation retry policy proven | PASS | E2/E5: accepted first attempt, known retryable scheduling, terminal/ambiguous exhaustion, due second attempt with token rotation, and third-attempt exhaustion pass with fake senders. Real provider/cron execution is outside this local proof. |
| 14 | secure manage flow | PASS | E11 supersedes the earlier PENDING. `manage-early-access.spec.ts` now runs in the containerized runtime and passes: a real fragment token resolves, PII is masked, and the row unsubscribes only after the explicit action — the journey E3 could not execute for want of a disposable DB. Remaining boundary: active/unsubscribed axe assertions are still missing (row 8). |
| 15 | unsubscribe/resubscribe proven | PASS | E2 `unsubscribe-early-access.use-case.test.ts`, `resubscribe-early-access.use-case.test.ts`, and repository contract with fakes prove explicit unsubscribe, token rotation, canonical-row reuse, consent refresh, and eligibility semantics. Real DB/browser evidence remains in rows 6/7/14. |
| 16 | launch dry run proven | PASS | E5 `launch-operations.test.ts`: deterministic full-payload fingerprint, operator-only fake delivery, rendered HTML/text, no subscriber-state mutation, and production rejection of mismatched fingerprint. No actual maintainer mail or protected workflow was sent/run. |
| 17 | launch idempotency/manual-review semantics proven | PASS | E5: sending persisted before acceptance, both known failures, actual second ambiguous execution with identical message/key, expired ambiguity → `manual_review` with zero provider calls. `runLaunchProduction` fake eligibility/log test passes. Remote Resend idempotency is not inferred. |
| 18 | daily maintenance proven | PENDING | E2/E5 retry, retention-boundary/anonymization, authorization and aggregate-only route tests pass; `vercel.json` schedules `0 5 * * *` (05:00 UTC). No deployed Vercel Cron execution or disposable-DB maintenance run observed. |
| 19 | launched-mode transition proven | PASS | E4/E6 both optimized local builds exit 0. Browser comparison: early-access has one form/two CTA links; launched has no form/three `Get Corpus` links to the configured synthetic HTTPS destination. Hero heading and How/Lexicon/Philosophy text are identical. E2 rejects stale launched submissions before CAPTCHA/persistence. |
| 20 | legal copy matches behavior | PENDING | E6 source/render review aligns listed processors, no sale/unrelated marketing, no email tracking, retention, and pre-release terms with implemented contracts. Real provider tracking settings, monitored reply address and postal/contact deployment values remain unverified; local legal pages omit Contact when these values are absent. |
| 21 | production indexable / previews noindex | PENDING | E2 discovery and production-smoke fixtures prove both policies; E3 local robots blocks crawling and metadata is `noindex, nofollow`. Actual production-domain indexing headers and Preview policy await deployed readback. |
| 22 | security headers present | PASS | E6 HTTP readback from local optimized artifact returns CSP, HSTS `max-age=63072000; includeSubDomains`, `nosniff`, `DENY`, strict-origin referrer policy, camera/microphone/geolocation denial. E2 CSP/production-smoke fixtures pass. Actual edge/CDN readback remains deployment work. |
| 23 | no PII in logs/artifacts | PENDING | E5 Pino capture drops email, normalized email, raw token/hash, CAPTCHA token/score, provider body, DB URL, secret and form payload fields; confirmation ambiguity and fake launch log assertions are safe. E7 Gitleaks finds no repository-history leaks. A unified capture of all live signup/manage/cron/provider paths and remote workflow artifacts was not available; field allowlisting does not establish safety of arbitrary log message strings. |
| 24 | public docs safe | PASS | E6 manual README/operations/reference review finds configuration names and synthetic placeholders; no live subscriber data/credentials added. E11 re-review before the flip: configuration remains names-only, every domain outside the design prototypes is `.example`/`.invalid`, and no live subscriber data or credential is tracked. The `secret-scan` workflow (gitleaks 8.30.1, `fetch-depth: 0`, `--exit-code 1`) is green on `main` at `3cff40e` over the full 29-commit history, and over all 109 commits reachable from every ref. Machine-specific paths have been removed from tracked files. GitHub visibility, branch protection, private vulnerability reporting and Dependabot alerts remain separately pending as repository settings. |
| 25 | stage/smoke/promote deployment proven | PENDING | E2 production-smoke contract tests and E6 workflow inspection cover exact SHA checks, stage without domain, smoke, second SHA check, promote same artifact. No actual protected Vercel stage/promote workflow or immutable deployment evidence exists in this verification. |
| 26 | rollback documented | PASS | E6 reviewed `docs/operations/rollback.md`: explicit known-good target, eligibility, no rebuild, post-rollback smoke and expand → deploy → contract discipline. Execution is not claimed or required by this row. |

## E1 — Clean install and static gates

Created `/tmp/corpus-task22-clean-ZKNb6y` with `mktemp -d`, then extracted
`git archive HEAD` there. Active dependencies/build output were preserved.
Initial `bun install --frozen-lockfile` failed with “Unexpected accessing
temporary directory”; `BUN_TMPDIR=/tmp bun install --frozen-lockfile` succeeded
with Bun 1.3.13. `bun run check` exited 0: type generation/typecheck passed,
Biome checked 167 files, stack auditor printed `NOT STANDARD (v4)`.

`bun scripts/stack-conformance/stack-audit.ts . --json` in the actual Git
worktree isolated the red construction finding from archive-only Git metadata.
Warnings also include config-secrets detection, adapter naming, no Vercel link,
no seed script and missing overview/concepts docs. `ciRed:[]` explains the
zero exit status; it is not evidence that full conformance is green.

`bunx depcruise --config .dependency-cruiser.json src app` exited 0 and reported
166 modules / 294 dependencies with no violations.

## E2 — Full unit/integration inventory

Command: `env -u DATABASE_URL -u DATABASE_URL_TEST -u DATABASE_URL_UNPOOLED bun run test`.
Result: 201 passing tests, 39 passing files, one skipped file, zero test failures.
Coverage includes domain, in-memory repository contracts, signup/action
boundaries, CAPTCHA adapters, confirmation/retry/retention, manage/token
handling, email HTML/text copy, launch operations, release-stage rendering,
discovery/CSP and production smoke. The real repository suite uses
`DATABASE_URL`, not the nominal test-variable names; its `beforeEach` performs
an unfiltered table delete. No safe disposable endpoint was verified, so it
remains skipped and `db:migrate` was not run.

## E3 — Browser and axe evidence

Final command in the isolated snapshot:

```sh
env -u DATABASE_URL -u DATABASE_URL_TEST -u DATABASE_URL_UNPOOLED \
  PLAYWRIGHT_BASE_URL=http://localhost:3022 SITE_URL=http://localhost:3022 \
  CORPUS_RELEASE_STAGE=early-access bun run e2e -- --workers=1 --reporter=line
```

Result: 31 passed / 9 failed, 40 total, 54.5s. Chromium: 24/26 pass;
Firefox: 3/3 pass; mobile Chrome: 4/4 pass; WebKit: 0/3 and mobile Safari: 0/4
blocked before navigation by missing `libevent-2.1-7t64`, `libavif16` and
`libmanette-0.2-0`. `bunx playwright install firefox webkit` successfully
downloaded Firefox 155.0/build 1543 and WebKit 26.6/build 2359, then reported
those host dependencies. System packages were not installed.

The Chromium failures are homepage axe contrast and management fixture setup
(`DATABASE_URL is required for management E2E tests`). Privacy/Terms axe pass.
Representative contrast: navigation 3.83:1 against required 4.5:1; ghost
lexicon entries can be approximately 1.12:1 against required 3:1. No axe
suppression or color change was made. Missing active/unsubscribed manage axe
checks must be added before claiming all five required surfaces are covered.

Local server setup needed scoped sandbox permission because binding port 3018
returned EPERM, then EADDRINUSE outside the sandbox. Port 3022 was used. The
server used synthetic, syntactically valid loopback DB URLs (port 1); the test
runner had no DB URL. No DB request was needed for the invalid-email scenario.
An initial run without required DB config was stopped on Next error pages;
a subsequent run with malformed dummy URLs produced 27/40 passes and a setup
error on malformed-email submission. Both were superseded by the final run
above, where malformed-email validation passes. Those setup failures are not
classified as application defects.

Passing journeys include hero/anchors, document scroll/sticky header/progress,
mobile specimen pairing across resizes, JavaScript-disabled content, reduced
motion, philosophy inversion, lexicon click/keyboard/drag/pause/progress,
cloze, legal discovery, malformed email and local Preview policy. Browser
coverage still omits valid signup, duplicate/resubscribe, provider/internal
failure and CAPTCHA rejection journeys against a real app/database.

## E4 — Optimized builds and Lighthouse

Both `CORPUS_RELEASE_STAGE=early-access bun run build` and
`CORPUS_RELEASE_STAGE=launched CORPUS_DOWNLOAD_URL=https://downloads.corpus.example/v1 bun run build`
passed with `SITE_URL=http://localhost:3022` and inert loopback DB placeholders.
Each generated 11 static pages; the maintenance route remains dynamic. Initial
sandbox build failed to fetch Karla/Newsreader. Scoped network escalation
resolved font fetching; a further attempt exposed missing required DB config,
resolved with synthetic placeholders. No source or font mechanism was changed.

The early-access artifact was served with `bun run start --port 3023`.
The precise Lighthouse invocation was:

```sh
CHROME_PATH="$(bunx playwright path chromium 2>/dev/null || echo /path/to/chrome)" \
  LHCI_URL=http://localhost:3023 LHCI_DEPLOYMENT_ENV=preview \
  bunx lhci collect --settings.chromeFlags=--no-sandbox
bunx lhci assert
```

Collection exited 0; assertions exited 1. Three report files in the isolated
snapshot's `.lighthouseci/` are `lhr-1788805090826.json`,
`lhr-1788805102951.json`, `lhr-1788805114564.json`. Respectively:
performance 0.87 / 0.89 / 0.88; accessibility 0.95 / 0.95 / 0.95;
best practices 0.96 / 0.96 / 0.96; SEO 1 / 1 / 1. The mathematical performance
median is 0.88. LHCI's assertion output selected 0.89 and still failed.
Other browser verification shared this host, so these are local measurements,
not a remote Preview performance conclusion. `collect` + `assert` were used
instead of `autorun` to avoid its configured public artifact upload.

## E5 — Safe launch/log rehearsals

Fresh focused command:

```sh
env -u DATABASE_URL -u DATABASE_URL_TEST -u DATABASE_URL_UNPOOLED bun run test \
  src/core/use-cases/send-launch-email.use-case.test.ts \
  src/adapters/logging/pino-logger.adapter.test.ts \
  src/ops/launch-operations.test.ts \
  src/core/use-cases/send-confirmation-email.use-case.test.ts \
  src/core/use-cases/retry-failed-confirmations.use-case.test.ts \
  src/core/use-cases/purge-expired-signup-pii.use-case.test.ts \
  app/api/cron/maintenance/maintenance-route.handler.test.ts
```

28 tests / 7 files pass. Task 22 strengthens the ambiguous-launch test to
actually execute twice and compare the complete message/idempotency key, and
extends Pino capture assertions to all forbidden field categories. No real
launch CLI/provider/production adapter was invoked. Captured log checks cover
Pino filtering, confirmation ambiguity, fake production-launch UUID/state and
maintenance aggregate output; they are not a complete live-path capture.

## E6 — Manual/source/reference observations

Authoritative references: `docs/design/prototypes/landing-lexicon.html`,
`email-confirmation.html`, `email-launch.html`. Inspected HTML/CSS alongside
rendered images at 1440px and 390px. Landing captures used reduced motion;
normal choreography/keyboard behavior is covered by the passing E3 tests and
the controller's previously recorded desktop/390px browser inspection after
`d8a5ef0`. Direct local screenshots show the expected paper/ink/clay system,
geometric mark, hero/section hierarchy, fonts, and mobile stage/specimen
pairing. This is a qualitative comparison, not a pixel-difference threshold.
Desktop reduced-motion specimens remain readable; the reference itself stacks
them in the same stage area. No additional redesign was made.

Two React Email HTML fixtures were rendered with synthetic management/postal
values using `render(ConfirmationEmail(...))` and `render(LaunchEmail(...))`,
without a sending adapter. Browser captures covered both widths, both schemes,
and both reference/implementation variants (16 email images). The comparison
**fails**: rounded outer card replaces the approved masthead/vertical-spine
layout; Georgia/Arial replace the Newsreader/Karla font stacks; paper colors
differ. Confirmation removes the pronunciation/encounter specimen detail and
reduces the Capture/Enrich/Practice section to one line. These are not changes
required by the two-message copy contract.

Dark browser rendering is also defective in both emails: reference h1 is
`rgb(231, 228, 221)` on the dark surface; implementation h1 remains
`rgb(33, 29, 25)` while `.card` becomes `#24211d`, making the heading almost
invisible. The launch panel remains light. The implementation's dark rules
do not preserve the reference's ink/muted/clay/rule behavior. Apple Mail,
Gmail and Outlook rendering/inversion were not tested; browser emulation is
not an email-client compatibility claim. HTML/text copy tests pass but do not
test visual hierarchy or dark-mode legibility. Email links remain ordinary
keyboard-focusable anchors by inspection; a complete email keyboard/screen
reader review remains pending. Email motion is not part of the references.

Local evidence paths (temporary, not uploaded):
`/tmp/task22-landing-{390,1440}.png`,
`/tmp/task22-landing-reference-{390,1440}.png`, and
`/tmp/task22-{confirmation,launch}-{390,1440}-{light,dark}-{reference,implementation}.png`.
Screenshots were directly inspected for both landing widths, mobile
confirmation/light, and mobile launch/dark; metrics were collected for all
16 email combinations. Source review supplies the remaining shared-layout
observations. Temporary files are not durable repository artifacts.

`node task22-stage.mjs` in the isolated snapshot compared saved early-access
HTML against the served launched build. It asserted one vs zero signup forms,
two Join links vs three configured Get links, unchanged h1 and exact text
equality for `how`, `lexicon`, `philosophy`. Titles/descriptions changed to the
approved release wording. The script made no submissions or download requests.

Local optimized HTTP readback returned the six security-header categories
listed in row 22. Source review covered `.github/workflows/{ci,preview,
preview-cleanup,deploy-production,launch-email,secret-scan}.yml`, `vercel.json`,
README and all operations runbooks. Workflow intent is not execution evidence.
Legal processor/retention descriptions match local code; deployed provider
settings and contact values remain pending. Task 21 records PRIVATE GitHub
visibility on 2026-09-07; this task did not change or newly attest remote settings.

## E7 — Final verification and release constraints

The final active-tree `bun run check`, explicit dependency-cruiser, full Vitest,
`git diff --check`, and checklist row/order validation are recorded in the task
report. A Gitleaks 8.30.1 full-history run (`gitleaks git . --redact --no-banner
--exit-code 1`) scanned 32 commits / approximately 872 KB with no leaks. The
scanner's cached executable was outside the repository; no secret values were
printed. Scanner success is bounded secret-pattern evidence, not proof of all
possible PII absence.

Initial unresolved release evidence (performance and local email parity are
subsequently resolved in E8/E9): full stack conformance, landing axe, performance
gate, email reference/dark parity, disposable Neon migration/contracts, complete
browser/Manage axe inventory, WebKit host dependencies, live Preview isolation
and cleanup, production signup/indexing/cron/provider settings, all-path log
capture, external GitHub protections, and actual stage/smoke/promote. Deferred
Minor from the brief remains: signup-result CSS expects `data-state="ok"` or
`"error"`, while the rendered output does not supply it. No production fix was
made in the initial verification task; concrete defects were reported to the controller.

## E8 — Fix round 1 and post-fix verification

Four scoped fixes were attempted; the font approach below was rejected in
review and is superseded by E9. Maintenance now
uses `maintenance.wiring.ts`; launch constructs its use case in
`launch.wiring.ts` and injects it into the operation. The actual audit runs in
a regression and checks construction green plus every result for RED, rather
than trusting the command's exit code. The test first failed on RED
construction; focused architecture/launch/maintenance verification passes
11 tests. Full STANDARD remains unmet for the five YELLOW findings in row 1.

Both email templates now follow the authoritative table-based masthead,
vertical spine, square panels, Newsreader/Karla fallback stacks, hierarchy,
and #F1EFE9/#FBFAF6 palette. Confirmation restores pronunciation, encounter
history and separate Capture/Enrich/Practice details in HTML and text. The
approved confirmation wording, dynamic launch payload, Get Corpus destination,
management links and postal footer remain. Explicit `ink`, `muted`, `clay`,
`panel`, `rule` and `spine` classes override inline light colors in supported
dark-mode clients; outer table and body both carry the paper background.
Outlook conditional fallback CSS is static trusted head markup; dynamic
content remains React-escaped. Layout does not depend on web fonts, flex/grid,
CSS variables, rounded cards or browser-only layout features.

The three new email assertions failed before implementation. Nine Chromium
render checks pass: two emails × 390/1440px × light/dark, plus stripped
stylesheets/body-style fallback. References and implementation use identical
blocked external-font requests for deterministic fallback rendering. Checks
compare computed background/heading/panel colors, font family/size, heading
position, spine count, overflow and management URL. Dark heading is
`rgb(231, 228, 221)`; panel is `rgb(20, 20, 25)`, matching the references.
Mobile confirmation/light and launch/dark screenshots were directly inspected;
16 final images are preserved in `/tmp/task22-fix1-email-final-renders`. Actual Apple Mail,
Gmail/Outlook inversion and email screen-reader testing remain pending.

The signup output now emits `data-state="ok"` for success and `"error"` for
invalid-email/retry/closed, while idle has no state attribute. Four rendering
regressions failed before the change; all five result tests now pass. Action,
CAPTCHA, live-region and signup semantics are unchanged.

Performance root cause was application font payload. Original saved reports
showed LCP 3756–3769ms with score .56 and 25% weight, losing 11 points; TBT
lost at most another 1.8 points. The LCP element was `p.lede`. Raw observed
LCP was before the hero animation, so no choreography changes were justified.
On a fresh early-access build, three controlled baseline runs scored
0.84/0.89/0.84 with LCP 4368/3757/4356ms. Four initial font files accounted for
406,516 body bytes. Newsreader's full variable font payload enlarged critical
downloads. The round-1 claim that the landing reference omitted `opsz` was
incorrect: its Google request explicitly includes `opsz` 6..72. The email
reference's different request was mistakenly generalized to the landing.

Round 1 removed the optical-size axis, reducing font bodies to 194,556 bytes
(52.1% less). Although families, normal/italic styles and colors remained,
outline metrics and wrapping changed. The claim of retained geometry from
`/tmp/task22-fix1-landing-{1440,390}.png` is retracted: the desktop philosophy
heading changed from one line (512×59.84375px) to two (496×119.6875px). This was
not an acceptable reference-parity tradeoff. The 200KiB budget regression
passed, but did not guard loaded-font typography. Historical measurements of
that now-superseded artifact on the otherwise idle host:

| Run | Performance | LCP | TBT | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- | --- |
| Run 1 | 0.95 | 2712ms | 115ms | 0.95 | 0.96 | 1.00 |
| Run 2 | 0.92 | 3317ms | 108ms | 0.95 | 0.96 | 1.00 |
| Run 3 | 0.96 | 2556ms | 102ms | 0.95 | 0.96 | 1.00 |

Host benchmark indices were 2645–2691 before and 2579–2667 after; improvement
does not depend on a faster host. CLS remained approximately 0.0000071.
Lighthouse thresholds, run count, audits and Preview indexing policy are
unchanged. Baseline reports: `/tmp/task22-fix1-early-access-baseline-lhci`;
post-fix reports: `/tmp/task22-fix1-lhci-asserted` (also copied before assertion
to `/tmp/task22-fix1-postfix-lhci`). LHCI collection rotates its output directory;
the original E4 reports were inspected before the diagnostic recollection.
No public report upload was run.

Commands use `SITE_URL=http://localhost:3025`, `CORPUS_RELEASE_STAGE=early-access`
and inert loopback DB placeholders for `bun run build` / `bun run start --port
3025`. The optimized build passes (11 static pages, maintenance dynamic).

```sh
CHROME_PATH="$(bunx playwright path chromium 2>/dev/null || echo /path/to/chrome)" \
  LHCI_URL=http://localhost:3025 LHCI_DEPLOYMENT_ENV=preview \
  bunx lhci collect --settings.chromeFlags=--no-sandbox
bunx lhci assert
bun run check
bunx depcruise --config .dependency-cruiser.json src app
env -u DATABASE_URL -u DATABASE_URL_TEST -u DATABASE_URL_UNPOOLED bun run test
DATABASE_URL= DATABASE_URL_UNPOOLED= DATABASE_URL_TEST= \
  PLAYWRIGHT_BASE_URL=http://localhost:3025 SITE_URL=http://localhost:3025 \
  CORPUS_RELEASE_STAGE=early-access bun run e2e -- --workers=1 --reporter=line
git diff --check
```

`check`, dependency rules, full Vitest, Lighthouse assertion and whitespace
checks pass. Full Vitest initially hit `spawnSync bun EPERM` in the audit
subprocess under the process sandbox; the identical suite outside that
sandbox passes 210/210 in 2.55s. Generated Lighthouse HTML/JSON also caused
an initial Biome scan failure; moving those generated artifacts to the named
temporary evidence directory restored the source check without changing rules.
Browser matrix: Chromium 34/36, Firefox 3/3, mobile Chrome 4/4; WebKit/mobile
Safari 0/7 due to the same missing libraries in E3. Total 41 passed / 9 failed,
41.0s. Landing colors and axe assertions remain unchanged. No remote service,
real provider sends, database mutation or deployment was performed. All ten
remote-dependent PENDING rows remain PENDING.

## E9 — Fix round 2: optical typography retained, delivery subset measured

Root cause and RED: the authoritative `landing-lexicon.html` line 11 requests
`Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500`. Removing `opsz`
fixed optical outlines instead of allowing the browser's default automatic
optical sizing. Existing philosophy CSS stayed italic 300, 54.4px at 1440px,
line-height 1.1 and max-width 16ch. Before production edits, the new loaded-font
geometry test failed: expected width 512, received 496. Reviewer measurements
also established the doubled line height above. No CSS geometry was changed.

Final solution: `next/font/local` delivers pinned, self-hosted Newsreader WOFF2
subsets with the **full optical-size axis 6–72**, normal weight 300–600 and
italic weight 300–500. Installed Next/google supports full variable weight or
fixed weights, but cannot express these narrowed variable ranges with `opsz`.
The upstream source is revision `1ece6a8bfe5db1a2b90c76cc1fe5d3b2eed5dcf3`,
Newsreader version 1.003, matching the original local Google font. The script
verifies source hashes and pins fonttools/Brotli/Zopfli; repeat regeneration
produced byte-identical output. The OFL license and coverage policy are vendored.
Karla remains on `next/font/google`; both families retain preload and swap.

The subset preserves current English text, punctuation, default Latin shaping
and available pronunciation glyphs. Before finalization, an actual-WOFF2 test
caught missing U+014B (ŋ), outside the IPA block; it failed with codepoint 331,
then passed after inclusion. Upstream Newsreader supplies ə/ŋ/ð from current
pronunciations; its other IPA symbols already need system fallback. This is
not a claim of full IPA/script coverage. Future non-English copy or optional
stylistic features require reviewing/regenerating the subset.

Independent Chromium comparison rendered the authoritative HTML with its
original fully loaded optical-size local font files and unchanged reference
CSS. The final implementation matches desktop heading x=270, y=4501.71875,
width=512 and height=59.84375px exactly: one line. The automated regression also
checks that the italic face is actually loaded. At 390px, final heading is
320×38.4375px. Geometry evidence is bounded to the measured heading; it is not
a blanket claim of pixel parity for every state. Reference scripts were
disabled for this isolated typography comparison, so its screenshot does not
exercise scroll-driven inversion. The existing inversion browser test passes.

Both 390px and 1440px initial-load measurements fetched exactly three
same-origin preloads, with no Google runtime request and no extra Latin-extended
font request. Browser encoded and decoded body sizes agree:

| File | Body bytes |
| --- | --- |
| Karla Latin | 32,196 |
| Newsreader normal subset | 78,148 |
| Newsreader italic subset | 91,700 |
| Total | 202,044 (197.31KiB; 50.3% below original 406,516) |

The unchanged budget is strictly below 200KiB (204,800 bytes). Lighthouse's
network audit confirms the same 202,044 resource bytes in each run; with its
reported response overhead, font transfers total 205,046 bytes. This distinction
is intentional: the regression budgets font response bodies, not HTTP headers.

Three optimized, otherwise idle-host early-access runs, using the exact E8
collection/assert commands and unchanged Preview indexing policy:

| Run | Performance | LCP (ms) | TBT (ms) | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.93 | 3157.0843 | 88 | 0.95 | 0.96 | 1.00 |
| 2 | 0.93 | 3157.2580 | 83 | 0.95 | 0.96 | 1.00 |
| 3 | 0.93 | 3156.8094 | 90.5 | 0.95 | 0.96 | 1.00 |

Collection and `lhci assert` exit 0; median performance 0.93. CLS is
0.0000067563 every run. Benchmark indices 2946/2841/2819.5 differ from E8's
baseline: these are observed local measurements, not a claim of identical CPU
conditions or remote performance. The font reduction is directly measured;
the final artifact satisfies both typography and existing Lighthouse gates.
No threshold, run count, audit, section spacing/width, animation, color or
Preview policy was changed. No report was uploaded.

Final validation: optimized build passes (11 static pages); `bun run check`
passes (175 files); depcruise passes (169 modules/304 dependencies); full
Vitest passes 214 tests/43 files in 2.66s with one real-Neon file skipped.
Focused font/stack unit checks pass 5 tests/2 files in 859ms; focused Chromium
typography/font-budget/email checks pass all 11 tests in 4.5s.
Actual JSON construction is green (3 obligations), zero RED, `ciRed:[]`;
`standard:false` and the same five named YELLOW findings keep row 1 FAIL.
Full browser matrix: 42 pass/9 fail of 51 in 44.9s; Chromium 35/37, Firefox
3/3, mobile Chrome 4/4. Same nine known failures: accepted contrast, absent
disposable DB and seven missing WebKit/mobile-Safari host-library launches.
No new application failure. Whitespace checks pass. All ten remote-dependent
PENDING rows remain PENDING; no remote state, provider or DB was mutated.

Evidence retained locally: `/tmp/task22-fix2-lhci-asserted` (three LHRs plus
assertion results), `/tmp/task22-fix2-font-analysis.json`,
`/tmp/task22-fix2-{reference,final}-philosophy.png`, and
`/tmp/task22-fix2-landing-{390,1440}.png`. The font README records regeneration;
`tests/e2e/landing-typography.spec.ts` and `tests/unit/font-assets.test.ts`
guard loaded geometry and actual delivered axes/glyphs respectively.

## E10 — Final workflow/config and documentation review fixes

CI and Preview migration steps supplied `DATABASE_URL`, but the actual
`drizzle.config.ts` reads only `DATABASE_URL_UNPOOLED`. The earlier masking
step's environment does not persist into the migration step. On a fresh runner,
the unpooled value was therefore absent and Drizzle selected its generate-only
placeholder. The production migration step already uses the correct unpooled
name and served as the working comparison.

Both affected migration steps now set `DATABASE_URL_UNPOOLED` from Neon's
direct `steps.neon.outputs.db_url`. Drizzle config, pooled application/test
connections, masking, branch creation/cleanup, conditions and migration
commands are unchanged. The new `migration-workflow-config.test.ts` parses
each actual workflow, derives the migration step's effective environment,
resolves direct/pooled outputs to distinct non-URL sentinels and imports the
actual Drizzle config. Both cases failed before the fix and pass afterward.
Boolean-only credential assertions print no connection value. The installed
`defineConfig` only constructs configuration; no migration, driver call or
database connection was made by this test.

Corrected two documentation drifts: row 18 now records the existing
`0 5 * * *` schedule (05:00 UTC), and Architecture references
`maintenance.wiring.ts` / `launch.wiring.ts`. `vercel.json` and the actual
schedule were not changed. Direct readback verifies both paths exist, the
cron evidence matches configuration, and row 18 remains PENDING. No existing
human-document assertion suite was present; no prose-only regression was added.

Final validation:

- Focused workflow/config tests: 2 passed / 1 file, 189ms; initial RED was
  2 failed / 1 file on the expected missing direct credential.
- Full Vitest: 216 passed / 44 files, 3.33s; one real-Neon file skipped with
  database URL variables explicitly unset.
- `bun run check`: exit 0; typecheck and Biome 176 files pass without warnings.
- Depcruise: exit 0; 169 modules / 304 dependencies, no violations.
- Actual stack JSON: construction green (3 obligations), zero RED, `ciRed:[]`,
  `standard:false`; the same five YELLOW findings keep row 1 FAIL.
- `git diff --check`: exit 0. All 26 requirement labels/order and all ten
  PENDING row IDs remain unchanged; overall 13 PASS / 3 FAIL / 10 PENDING.

These results establish local configuration correctness only. Rows 6, 10,
18 and all other remote-dependent rows remain PENDING. No database connection,
migration, workflow dispatch, provider send, deployment or remote mutation was
performed. Browser/Lighthouse evidence remains the E9 measurement; this fix
does not change application rendering, fonts, contrast or performance gates.

## E11 — Pre-public re-verification at `3cff40e`

Every locally reproducible gate re-run six commits past the initial baseline,
ahead of the repository visibility flip. Commands and their actual output:

```sh
bun run check      # exit 0
#   next typegen && tsc --noEmit      -> types generated, exit 0
#   biome check .                     -> 187 files, no fixes applied
#   stack-audit . --ci                -> NOT STANDARD (v4), zero RED, ciRed:[]
bun run test       # 49 files passed | 1 skipped (50) — 258 tests passed
bun run test:e2e   # 64 passed (33.4s)
```

Playwright matrix, from the containerized runtime: chromium 50, firefox 3,
webkit 3, mobile-chrome 4, mobile-safari 4. E9's two failure classes are gone -
the image carries the WebKit host libraries, and the DB-backed management
journey has a database to run against. `accessibility.spec.ts` passes axe on
homepage, Privacy and Terms with zero `serious` or `critical` violations, so
E3's homepage `color-contrast` violation no longer reproduces.

### Repository integration against real PostgreSQL

The suite skipped by `bun run test` was run explicitly against the disposable
containerized PostgreSQL 17, reached through the local Neon HTTP proxy so the
driver under test is the same `drizzle-orm/neon-http` used in production:

```sh
docker compose up -d db proxy
docker compose run --rm --no-deps e2e sh -c "bun tests/e2e/support/migrate.mjs"
DATABASE_URL='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  E2E_NEON_HTTP_ENDPOINT='http://127.0.0.1:4444/sql' \
  NODE_OPTIONS='--import ./tests/e2e/support/neon-local-endpoint.mjs' \
  bunx vitest run src/adapters/db/drizzle-early-access-signup.repository.integration.test.ts
# 1 file passed — 10 tests passed
```

That covers the partial-unique-index contract, duplicate-canonical-row and
create-race recovery, and the non-conflict driver-error sanitization case, so
rows 6 and 12 no longer rest on the in-memory mirror. It is real PostgreSQL and
not a Neon branch: Neon pooling and branch lifecycle stay with rows 10 and 25.

### Reproducibility fix required to obtain this evidence

`compose.yaml` bind-mounts the repository into the container, so Next.js also
loads the developer's local, untracked configuration there. `SITE_URL` takes
precedence over the `localhost:${PORT}` fallback in `server-env.ts`, so a local
value made all six `legal-seo.spec.ts` canonical-URL assertions fail inside the
container while CI — which has no local configuration file — stayed green.
Confirmed by reproducing the failure on a clean tree with every other change
stashed. `SITE_URL` is now pinned in the `e2e` service's `environment:` block
alongside `PORT`, which is the hazard `playwright.config.ts` already warned
about in its `webServer` comment: local configuration hid the fallback, and CI
has none. The container is hermetic in this variable now, and local matches CI.

### New index on `manage_token_hash`

`findByManageTokenHash` is reachable unauthenticated with no CAPTCHA and no rate
limit, and carried no index. Migration `0001_blushing_wasp.sql` adds a partial
one. Verified against real PostgreSQL after migration, at 5000 synthetic rows:

```text
Index Scan using early_access_signups_manage_token_hash_idx  (actual time=0.072..0.075 rows=1)
  Index Cond: (manage_token_hash = '4d2de545...'::text)
Execution Time: 0.178 ms

-- with the index disabled, i.e. the previous behaviour:
Seq Scan on early_access_signups  (actual time=0.665..0.667 rows=1)
  Rows Removed by Filter: 4998
```

The scan cost grew linearly with subscriber count; the index scan does not. The
synthetic rows were deleted afterwards and the containers torn down.

### Verdict

Overall **18 PASS / 1 FAIL / 7 PENDING**, from 13/3/10 at E10. The single FAIL
is row 1, unchanged and by its own rule: `bun run check` exits 0 with zero RED,
but stack conformance still reports `standard:false` on five YELLOW findings.
Every remaining PENDING row needs a deployed environment, a live provider, or a
Neon branch lifecycle — none of them is reproducible locally, and none of them
blocks making the repository public.

## E12 — Public-flip fixes at `chore/dependabot-hardening`

### Lighthouse: duplicated motion root removed

`src/features/landing/ui/landing-shell.tsx` mounted `<PageMotion />` twice. Each
instance ran the full effect: a second pair of `scroll`/`resize` listeners, a
second `loadMotionEngine()`, a second `gsap.registerPlugin(ScrollTrigger)`, a
second `gsap.context()` with a `scrub: true` ScrollTrigger, and a second
`splitWords()` on the philosophy heading, the second call operating on DOM the
first had already replaced.

Measured before and after, same host, same command, production build served on
port 3019 (3018 was occupied), `LHCI_DEPLOYMENT_ENV=preview`, three runs each:

| | performance | LCP (ms) | TBT (ms) |
| --- | --- | --- | --- |
| before | 0.92 / 0.94 / 0.85 | 3167 / 3157 / 3964 | 80 / 22 / 60 |
| after | 0.93 / 0.92 / 0.92 | 3162 / 3306 / 3305 | 18 / 39 / 64 |

Median is unchanged at 0.92; the claim is specifically about the tail. The worst
run moved from 0.05 below the 0.90 gate to 0.02 above it, and the spread fell
from 0.09 to 0.01. TBT's peak fell from 80ms to 64ms.

This does **not** prove CI will pass. CI measures a freshly deployed Vercel
preview — cold function, cold CDN, shared runner — and has been observed at
0.87-0.89 where this host reports 0.92. The pipeline run on the pull request is
the only evidence that settles it. No threshold, run count, or assertion was
changed.

### Finding: the gate is best-of-3, not the median spec §30 requires

`lighthouserc.cjs` omits `aggregationMethod`. LHCI defaults to `optimistic`,
which for a `minScore` assertion evaluates `Math.max` across runs. E4 already
recorded the symptom without naming it: *"performance 0.87 / 0.89 / 0.88 … median
is 0.88. LHCI's assertion output selected 0.89 and still failed."*

Two consequences. A CI failure reporting `found: 0.89` means all three runs were
at or below 0.89, so it is not one unlucky sample. And the gate is currently
**more lenient** than spec §30's "Median hard thresholds", not stricter — adding
`aggregationMethod: 'median'` would tighten it. Left unchanged deliberately:
tightening a required gate is a decision, not a cleanup, and
`tests/unit/lighthouse-config.test.ts` pins the current assertion object.

### CAPTCHA selection now fails closed off Vercel

`provideExternalApi` selected the deterministic fake whenever `VERCEL_ENV` was
anything other than `production`, including unset. Any non-Vercel deployment
therefore served a CAPTCHA-free signup form, which `provideNotifications` pairs
with the real Resend sender whenever those variables are present.

Vercel `preview` and `development` still select the fake with no configuration,
as spec §8 and §34 require. Absence of `VERCEL_ENV` now requires
`CORPUS_FAKE_CAPTCHA=1`, and Production refuses to start if the variable is
present at all — any value, so a misspelled opt-in cannot be silently ignored.
The flag is passed explicitly by `compose.yaml` and `playwright.config.ts`, which
is the "explicit pipeline signal rather than absent configuration" §34 asks for.

Verified by neutralising the guard and confirming exactly the two off-Vercel
cases fail, then restoring it: the assertions are not vacuous.

### Fixed: a Preview CAPTCHA assertion that could not fail

`tests/e2e/preview-safety.spec.ts` asserted `#google-recaptcha-v3` had count 0,
but `recaptcha-bridge.tsx` uses `google-recaptcha-enterprise` — a name the
application has never used. Spec §28's "no real CAPTCHA in preview" was
therefore unproven. Corrected, and paired with a `script[src*="recaptcha"]`
assertion that does not depend on the element id.

### Gates at this state

`bun run check` exits 0. `bun run test` 266 passed / 1 file skipped, from 258 at
E11: +8 CAPTCHA-selection cases. `bun run test:e2e` 64 passed. A second
`bun install --frozen-lockfile` exits 0 and `bunx drizzle-kit generate` reports
no schema change.

Incidental: `.lighthouseci/` was absent from `biome.json`'s exclude list, so any
local `bun run lighthouse` left artifacts that made `bun run check` fail on
generated output. Added, alongside its siblings `test-results`,
`playwright-report` and `blob-report`. The `$schema` pin was also still 2.4.2
after the biome 2.5.12 bump.
