# Definition-of-Done evidence — 2026-09-07

This records specification §39 in its original order. Verification baseline:
`454d4877ede963cfe792c648d693ed9a4a3244d8`. Only documentation and test assertions
changed during this task. The release is **not verified complete**.

PASS means the stated local scope was observed. FAIL means observed contrary
evidence. PENDING means required evidence is unavailable or incomplete; local
fakes never establish a remote deployment or database result. Email visual
defects below remain release blockers even though §39 has no dedicated email
visual-parity row. The approved landing contrast exception does not turn axe green.

| # | Specification requirement | State | Evidence and remaining boundary |
| --- | --- | --- | --- |
| 1 | stack conformance green | FAIL | E1: `stack:check` exits 0 but reports `NOT STANDARD (v4)`. JSON has `standard:false`, `ciRed:[]`, and RED `blueprint-construction` in `src/composition/server/maintenance.ts` and `src/ops/launch-production.ts`; use cases are constructed outside permitted wiring files. |
| 2 | typecheck green | PASS | E1 clean committed-tree install: `next typegen && tsc --noEmit`, exit 0. E7 final active-tree static verification also checks the test-only changes. |
| 3 | Biome green | PASS | E1: 167 files checked, no fixes. E7 reruns Biome on final work. |
| 4 | dependency rules green | PASS | E1: explicit `bunx depcruise --config .dependency-cruiser.json src app`, no violations, 166 modules / 294 dependencies. The stack script alone is not substituted for running this command. |
| 5 | Vitest green | PASS | E2/E7: 201 tests passed, 39 files passed; one real-Neon integration file skipped. This does not satisfy row 6. |
| 6 | repository integration green on disposable Neon | PENDING | No verified disposable Neon connection was supplied. The integration suite skips with no `DATABASE_URL`; its setup deletes every signup row, so it was not pointed at an unverified environment. No migration or real DB test was run. |
| 7 | Playwright green | FAIL | E3 final full matrix: 31 passed / 9 failed of 40. One actual homepage contrast failure, one management test blocked by missing DB, seven WebKit/mobile-Safari launches blocked by host libraries. Existing browser inventory also lacks several §28 successful signup/error/resubscribe journeys; unit coverage is not browser coverage. |
| 8 | axe green | FAIL | E3: homepage serious `color-contrast` violation; Privacy and Terms pass. Accepted prototype muted/ghost colors remain unchanged. Active and unsubscribed Manage pages have no axe assertions in the current suite and were not available against a real DB. |
| 9 | Lighthouse green | FAIL | E4: three mobile production-artifact runs with Preview indexing policy. Performance 0.87 / 0.89 / 0.88 (median 0.88 < 0.90); accessibility 0.95, best practices 0.96, SEO 1.00 in every run. `lhci assert` exits 1. No remote Preview run claimed. |
| 10 | preview isolation proven | PENDING | E6 source inspection: workflow creates `pr-<number>` from `development`, CI creates `ci-<run-id>-<attempt>`, migration/cleanup and URL masking are present. No authenticated remote workflow/Neon branch lifecycle evidence was gathered for this task. |
| 11 | no real preview email/CAPTCHA | PENDING | E2 composition/fake-CAPTCHA tests and E3 local no-CAPTCHA-script/noindex check pass. `src/composition/server/early-access.test.ts` verifies environment adapter selection. Actual Vercel Preview configuration and provider inactivity remain unverified. |
| 12 | idempotent production signup | PENDING | E2 `join-early-access.use-case.test.ts` verifies duplicate canonical row and create-race recovery with an in-memory repository. Production/real PostgreSQL partial-index concurrency and end-to-end signup remain unproven. |
| 13 | confirmation retry policy proven | PASS | E2/E5: accepted first attempt, known retryable scheduling, terminal/ambiguous exhaustion, due second attempt with token rotation, and third-attempt exhaustion pass with fake senders. Real provider/cron execution is outside this local proof. |
| 14 | secure manage flow | PENDING | E2 resolver, SHA-256/random-token, fragment-bridge, action and UI-state tests pass. E3 real management fragment → masked state → explicit unsubscribe could not run without disposable DB; active/unsubscribed axe remains missing. |
| 15 | unsubscribe/resubscribe proven | PASS | E2 `unsubscribe-early-access.use-case.test.ts`, `resubscribe-early-access.use-case.test.ts`, and repository contract with fakes prove explicit unsubscribe, token rotation, canonical-row reuse, consent refresh, and eligibility semantics. Real DB/browser evidence remains in rows 6/7/14. |
| 16 | launch dry run proven | PASS | E5 `launch-operations.test.ts`: deterministic full-payload fingerprint, operator-only fake delivery, rendered HTML/text, no subscriber-state mutation, and production rejection of mismatched fingerprint. No actual maintainer mail or protected workflow was sent/run. |
| 17 | launch idempotency/manual-review semantics proven | PASS | E5: sending persisted before acceptance, both known failures, actual second ambiguous execution with identical message/key, expired ambiguity → `manual_review` with zero provider calls. `runLaunchProduction` fake eligibility/log test passes. Remote Resend idempotency is not inferred. |
| 18 | daily maintenance proven | PENDING | E2/E5 retry, retention-boundary/anonymization, authorization and aggregate-only route tests pass; `vercel.json` schedules `0 0 * * *`. No deployed Vercel Cron execution or disposable-DB maintenance run observed. |
| 19 | launched-mode transition proven | PASS | E4/E6 both optimized local builds exit 0. Browser comparison: early-access has one form/two CTA links; launched has no form/three `Get Corpus` links to the configured synthetic HTTPS destination. Hero heading and How/Lexicon/Philosophy text are identical. E2 rejects stale launched submissions before CAPTCHA/persistence. |
| 20 | legal copy matches behavior | PENDING | E6 source/render review aligns listed processors, no sale/unrelated marketing, no email tracking, retention, and pre-release terms with implemented contracts. Real provider tracking settings, monitored reply address and postal/contact deployment values remain unverified; local legal pages omit Contact when these values are absent. |
| 21 | production indexable / previews noindex | PENDING | E2 discovery and production-smoke fixtures prove both policies; E3 local robots blocks crawling and metadata is `noindex, nofollow`. Actual production-domain indexing headers and Preview policy await deployed readback. |
| 22 | security headers present | PASS | E6 HTTP readback from local optimized artifact returns CSP, HSTS `max-age=63072000; includeSubDomains`, `nosniff`, `DENY`, strict-origin referrer policy, camera/microphone/geolocation denial. E2 CSP/production-smoke fixtures pass. Actual edge/CDN readback remains deployment work. |
| 23 | no PII in logs/artifacts | PENDING | E5 Pino capture drops email, normalized email, raw token/hash, CAPTCHA token/score, provider body, DB URL, secret and form payload fields; confirmation ambiguity and fake launch log assertions are safe. E7 Gitleaks finds no repository-history leaks. A unified capture of all live signup/manage/cron/provider paths and remote workflow artifacts was not available; field allowlisting does not establish safety of arbitrary log message strings. |
| 24 | public docs safe | PASS | E6 manual README/operations/reference review finds configuration names and synthetic placeholders; no live subscriber data/credentials added. E7 Gitleaks 8.30.1 scans 32 commits with no leaks. GitHub visibility/protection/security settings remain separately pending under Task 21. |
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
CHROME_PATH=/home/gonza/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
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

Unresolved release evidence: full stack conformance, landing axe, performance
gate, email reference/dark parity, disposable Neon migration/contracts, complete
browser/Manage axe inventory, WebKit host dependencies, live Preview isolation
and cleanup, production signup/indexing/cron/provider settings, all-path log
capture, external GitHub protections, and actual stage/smoke/promote. Deferred
Minor from the brief remains: signup-result CSS expects `data-state="ok"` or
`"error"`, while the rendered output does not supply it. No production fix was
made in this verification task; concrete defects were reported to the controller.
