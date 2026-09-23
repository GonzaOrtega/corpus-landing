<!-- review-gate:digest pr-21 -->
# PR #21 · Add comprehensive test coverage across all layers

## Like you are five
corpus-landing is the public early-access landing page for Corpus, an Android-first language-learning product. It explains the product, collects and confirms email signups, lets a subscriber manage or cancel their own signup through a tokenised link, sends one launch notification, and then flips the whole site into "Get Corpus" mode. It is a Next.js App Router site on Vercel with a Neon Postgres database reached through Drizzle, Resend for email, and a strict hexagonal layout in which the core declares ports, adapters implement them, and only the composition root is allowed to build an adapter. The repository is public, so its history and its documents are part of what it ships.

This pull request turns an existing but unmeasured test suite into a measured and enforced one. It adds a coverage provider, sets a hard threshold for each layer, writes thirty-three new test files and extends fifteen more so those thresholds are honest, and documents the whole scheme. Three things happened after it was first opened. Merging main brought the Sentry observability work inside the measured globs for the first time, which broke four tests and lowered three thresholds. An audit found that seven documents claimed continuous integration enforced this gate when no workflow ran it at all. The gate is now wired for real, both into the continuous integration test job, which is the only job with a database and therefore the only complete measurement, and into the local check command so a breach fails before a push.

Round one asked for seven fixes. While those were being made, a second helper
was fixing the same list independently, and its work reached the shared copy
first. Rather than throw either away, both were combined: each had found
something the other missed. The combined result passes every check, including
the one that runs against a real database, where nothing was skipped.

Round two then read the combined result. The good news is that the tests hold
up under scrutiny. Reviewers re-checked the two claims this change leans on
hardest and both are true, and the one test file that was dropped as a
duplicate really was covered by the one that was kept.

Nine things still need fixing, and eight of them are one idea repeated: the
rule still says it checks more than it checks.

The clearest example is in the build pipeline. There is a step whose whole job
is to stop everything if the throwaway database is missing. It watches the old
setting name. The setting that actually decides whether the database code gets
measured was renamed during the first round, and nothing watches the new one.
So if that name ever stops arriving, the database code is quietly dropped from
the measurement, everything else scores full marks, and the build goes green
having measured none of the thing that job exists to measure.

Two more of the same shape: the safety net that is supposed to catch a brand
new untested file only looks at a list that a person has to remember to update,
and three of the four checks in one new test cannot fail no matter what breaks,
because of a detail in how the test tool reuses stand-ins. That last one is my
error: I wrote a comment claiming a particular line made those checks reliable,
and it does not.

The ninth is different, and it is the one worth your attention. It is not a
testing problem, it is a real fault on the public signup form, and it was found
only because this change finally put that file under measurement. If Google's
anti-spam service refuses a request - which happens when the free quota runs
out, exactly the abuse the threat model anticipates - the code waits forever
instead of giving up. The visitor clicks Join and nothing happens at all. No
error message, no spinner, no submission. The button is simply dead until they
reload the page. This fault already exists on the live site; this change did
not cause it.

What you need to decide: whether that signup fault gets fixed here or in its
own separate change. Fixing it here means this pull request stops being only
about tests and starts changing what visitors experience. Fixing it separately
keeps this change clean but leaves the live site broken in that case for
longer. Everything else on the list is repair work to the rule itself, which
belongs here.

## In plain words
Round 2 looked at only the fixes from the previous round and found 19 things. I sorted them: 9 to fix now, 10 for later, 0 that do not apply, 0 waiting for you.

- **R-07 · fix** · ci.yml · The one job this change designates as the complete coverage measurement still reports success when the disposable database never appeared - it quietly measures less instead of failing. · In scope, in the threat model, important
- **R-18 · fix** · vitest.config.ts · The new safety net is said to stop any new folder or any new file at the top of the project from shipping unmeasured, but for files it only checks the ones already on the measured list, so a newly added top-level file (or a new folder outside src/) is still invisible to the gate and nothing turns red. · In scope, in the threat model, important
- **R-19 · fix** · drizzle-early-access-signup.repository.integration.test.ts · The destructive test suite was moved onto a separate database setting so an ordinary developer database can never be wiped, and the README and testing guide now warn about it, but the template file developers actually copy their settings from still lists that setting next to the ordinary ones with no warning at all. · In scope, in the threat model, important
- **R-20 · later** · vitest.config.ts · The summary comment above the coverage numbers was not refreshed after the two parallel fix lines were merged: it lists only some of the top-level files now being measured, and it still says three of the numbers below were pushed down by the merge when one of them has since been pushed back up. · Below the severity floor (important)
- **R-21 · later** · vitest.config.ts · The reason given for measuring the anti-spam bridge with unit tests instead of browser tests names the wrong switch: it says the fake-CAPTCHA flag is what leaves the site key empty, when the site key is actually decided by whether the deployment is production. · Below the severity floor (important)
- **R-22 · fix** · ci.yml · The new step that is supposed to stop the pipeline when the throwaway database is missing checks the old settings names and not the new one, so if the new name ever stops reaching the coverage run the pipeline still reports success while quietly measuring none of the database code it exists to measure. · In scope, in the threat model, important
- **R-23 · fix** · coverage-thresholds.test.ts · The new safety net proves every measured file has a rule, but nothing proves the reverse: a rule pointing at a file that no longer exists scores as perfectly covered and passes silently. · In scope, in the threat model, important
- **R-24 · fix** · instrumentation.test.ts · Three of the four checks in the new error-reporting test cannot fail: the stand-in modules record that they were loaded only the first time in the whole file, so the later "was not loaded" checks would stay green even if the code loaded them. · In scope, in the threat model, important
- **R-25 · fix** · testing.md · The testing guide says the new automated check makes it impossible to quietly lower a coverage number, but the check only refuses numbers below each layer's agreed minimum, so a number can still slide a long way down without anything objecting. · In scope, in the threat model, important
- **R-26 · fix** · recaptcha-bridge.test.tsx · The new anti-spam tests are what justified bringing this file into the measurement and raising its layer's number, yet they skip the one path where a failure is truly invisible: if Google's check refuses, the signup button silently does nothing forever, with no message and no error. · In scope, in the threat model, important
- **R-27 · later** · definition-of-done.md · The evidence row for the coverage gate mixes a fresh run without a database with a much older run that did have one, and presents both as current proof, even though the older run predates this round's new test files and the change of which setting turns the database suite on. · Below the severity floor (important)
- **R-28 · fix** · instrumentation-client.test.ts · The last test in the error-reporting suite permanently switches off a stand-in the whole file depends on, so any test added after it, or any run that does not keep the written order, fails. · In scope, in the threat model, important
- **R-29 · later** · instrumentation-client.test.ts · The test for a failed error-reporting load would still pass if the retry behaviour it appears to protect were deleted. · Below the severity floor (important)
- **R-30 · later** · recaptcha-bridge.test.tsx · The test for the small component that pre-loads Google's script checks only that it draws nothing on screen; the pre-loading itself, which is the component's entire reason to exist, never runs. · Below the severity floor (important)
- **R-31 · later** · next-config-headers.test.ts · Two of the six security headers the site sends on every page have their values checked by nothing, although the file that produces them is now advertised as fully covered. · Below the severity floor (important)
- **R-32 · later** · vitest.config.ts · One comment block states two different agreed minimums for the same newly measured files, eighty in one paragraph and one hundred a few lines later. · Below the severity floor (important)
- **R-33 · later** · next-config-headers.test.ts · One test pins the six documentation-discovery pages by their position in a list, so merely reordering that list fails the test although the site behaves identically. · Below the severity floor (important)
- **R-34 · later** · the PR · Status on the round-1 fix-now findings, per the author's triage (R-12 rated later; the remaining "later" items untouched). Pushed as `f4d19b9`. · Outside the gate's scope
- **R-35 · later** · the PR · **`e2e` red on `f4d19b9`, not this PR's change.** One of 67 Playwright tests failed on both attempts: `tests/e2e/living-lexicon.spec.ts:28` (autoplay ping-pongs through the whole Lexicon while visible · Outside the gate's scope

## How to answer
Reply `ok` to accept all of it, or override by id: `R-01 fix, R-04 no it is covered by the outbox test`.
To waive a rule, start your message with `skip review-gate` and say why.

## The record
| id | verdict | by | severity | scope | threat | file | summary |
|---|---|---|---|---|---|---|---|
| R-01 | fix | human | important | in | in | package.json:32 | The `check` command, which used to only inspect the code without touching anything, now runs the whole test suite — and one of those tests empties the signup table of whatever database the developer's local settings point at, which the setup guide says should be the shared Neon development branch. |
| R-02 | later | human | minor | in | in | docs/quality/testing.md:112 | The coverage documentation assumes a developer machine normally has no database configured, but the project's own setup instructions plus Bun's automatic loading of local settings mean it normally does — so the described difference between a local run and the pipeline, and the warning line the config prints, will rarely apply as written. |
| R-03 | later | human | minor | in | in | CLAUDE.md:33 | Two documents still describe the `check` command as only doing typechecking, linting and structure checks, even though this change makes it also run the entire test suite with coverage; one of them then tells contributors to run that suite a second time. |
| R-04 | later | human | minor | in | in | docs/quality/testing.md:75 | The new rule says a coverage number may only ever go up and that any reduction must be justified on that same page, but this change reduces three of them and records the reason somewhere else, leaving the page claiming the numbers come from a measurement that no longer produced them. |
| R-05 | later | human | minor | in | in | docs/quality/testing.md:50 | The page says the coverage tool is tied to the test runner's major version, but it is actually locked to one exact version while the test runner is allowed to drift within that major, and the tool refuses to work unless the two match exactly. |
| R-06 | fix | human | important | in | in | vitest.config.ts:98 | The "catch-all" coverage floor does not do what its comment and the testing guide promise: it is a whole-repository average, not a net under directories the named rules miss, so a brand-new folder with no tests at all can ship green. |
| R-07 | fix | auto | important | in | in | .github/workflows/ci.yml:86 | The one job this change designates as the complete coverage measurement still reports success when the disposable database never appeared - it quietly measures less instead of failing. |
| R-08 | later | human | minor | in | in | src/adapters/db/drizzle-early-access-signup.repository.test.ts:19 | The stand-in database accepts any sequence of query calls, so the new repository tests raise that file's coverage without checking a single thing about the queries it builds. |
| R-09 | later | human | minor | in | in | src/composition/capabilities/config-secrets.test.ts:35 | Several new "fails closed" tests accept any error whatsoever, so they would still pass if the code broke earlier and for an entirely unrelated reason. |
| R-10 | later | human | minor | in | in | app/about/page.test.tsx:11 | Three new page tests say they check that every published section is rendered, but they walk a list nothing requires to be non-empty, so emptying the page's content would leave them green. |
| R-11 | fix | human | important | in | in | vitest.config.ts:29 | The code that fetches a real anti-spam token from Google is left out of the coverage measurement on the grounds that browser tests cover it, but no browser test ever runs it. |
| R-12 | fix | human | important | in | in | vitest.config.ts:67 | The gate a developer runs before pushing and the gate the pipeline runs measure different sets of files, so for the database layer the local numbers are set far below what that machine actually achieves. |
| R-13 | fix | human | important | in | in | docs/quality/testing.md:67 | The rule that coverage numbers may only ever go up says any lowering must be written down in this document, yet the lowering this change itself performed is not written down there. |
| R-14 | later | human | minor | in | in | vitest.config.ts:8 | The reason given for skipping the database repository on a developer machine, that it would otherwise look completely untested, is no longer true once this change's own new tests are counted. |
| R-15 | fix | human | important | in | in | vitest.config.ts:60 | The measured area covers only two folders and one file, so several pieces of live production code at the top of the project are outside the gate entirely, and one of them has no test at all. |
| R-16 | later | human | minor | in | in | vitest.config.ts:100 | Nothing automatically checks that the agreed minimum for each layer is still respected, so a future change could quietly reduce one and only the written rule would object. |
| R-17 | later | human | minor | in | in | proxy.test.ts:194 | Two of the new proxy tests depend on the exact order of entries in a configuration list, so simply rearranging that list breaks them even though nothing about the behaviour changed. |
| R-18 | fix | auto | important | in | in | vitest.config.ts:140 | The new safety net is said to stop any new folder or any new file at the top of the project from shipping unmeasured, but for files it only checks the ones already on the measured list, so a newly added top-level file (or a new folder outside src/) is still invisible to the gate and nothing turns red. |
| R-19 | fix | auto | important | in | in | src/adapters/db/drizzle-early-access-signup.repository.integration.test.ts:20 | The destructive test suite was moved onto a separate database setting so an ordinary developer database can never be wiped, and the README and testing guide now warn about it, but the template file developers actually copy their settings from still lists that setting next to the ordinary ones with no warning at all. |
| R-20 | later | auto | minor | in | in | vitest.config.ts:112 | The summary comment above the coverage numbers was not refreshed after the two parallel fix lines were merged: it lists only some of the top-level files now being measured, and it still says three of the numbers below were pushed down by the merge when one of them has since been pushed back up. |
| R-21 | later | auto | minor | in | in | vitest.config.ts:36 | The reason given for measuring the anti-spam bridge with unit tests instead of browser tests names the wrong switch: it says the fake-CAPTCHA flag is what leaves the site key empty, when the site key is actually decided by whether the deployment is production. |
| R-22 | fix | auto | important | in | in | .github/workflows/ci.yml:99 | The new step that is supposed to stop the pipeline when the throwaway database is missing checks the old settings names and not the new one, so if the new name ever stops reaching the coverage run the pipeline still reports success while quietly measuring none of the database code it exists to measure. |
| R-23 | fix | auto | important | in | in | tests/unit/coverage-thresholds.test.ts:107 | The new safety net proves every measured file has a rule, but nothing proves the reverse: a rule pointing at a file that no longer exists scores as perfectly covered and passes silently. |
| R-24 | fix | auto | important | in | in | tests/unit/instrumentation.test.ts:27 | Three of the four checks in the new error-reporting test cannot fail: the stand-in modules record that they were loaded only the first time in the whole file, so the later "was not loaded" checks would stay green even if the code loaded them. |
| R-25 | fix | auto | important | in | in | docs/quality/testing.md:107 | The testing guide says the new automated check makes it impossible to quietly lower a coverage number, but the check only refuses numbers below each layer's agreed minimum, so a number can still slide a long way down without anything objecting. |
| R-26 | fix | auto | important | in | in | src/features/early-access/ui/recaptcha-bridge.test.tsx:165 | The new anti-spam tests are what justified bringing this file into the measurement and raising its layer's number, yet they skip the one path where a failure is truly invisible: if Google's check refuses, the signup button silently does nothing forever, with no message and no error. |
| R-27 | later | auto | minor | in | in | docs/verification/definition-of-done.md:30 | The evidence row for the coverage gate mixes a fresh run without a database with a much older run that did have one, and presents both as current proof, even though the older run predates this round's new test files and the change of which setting turns the database suite on. |
| R-28 | fix | auto | important | in | in | tests/unit/instrumentation-client.test.ts:116 | The last test in the error-reporting suite permanently switches off a stand-in the whole file depends on, so any test added after it, or any run that does not keep the written order, fails. |
| R-29 | later | auto | minor | in | in | tests/unit/instrumentation-client.test.ts:91 | The test for a failed error-reporting load would still pass if the retry behaviour it appears to protect were deleted. |
| R-30 | later | auto | minor | in | in | src/features/early-access/ui/recaptcha-bridge.test.tsx:190 | The test for the small component that pre-loads Google's script checks only that it draws nothing on screen; the pre-loading itself, which is the component's entire reason to exist, never runs. |
| R-31 | later | auto | minor | in | in | tests/unit/next-config-headers.test.ts:27 | Two of the six security headers the site sends on every page have their values checked by nothing, although the file that produces them is now advertised as fully covered. |
| R-32 | later | auto | minor | in | in | vitest.config.ts:170 | One comment block states two different agreed minimums for the same newly measured files, eighty in one paragraph and one hundred a few lines later. |
| R-33 | later | auto | minor | in | in | tests/unit/next-config-headers.test.ts:74 | One test pins the six documentation-discovery pages by their position in a list, so merely reordering that list fails the test although the site behaves identically. |
| R-34 | later | auto | important | out | in | PR | Status on the round-1 fix-now findings, per the author's triage (R-12 rated later; the remaining "later" items untouched). Pushed as `f4d19b9`. |
| R-35 | later | auto | important | out | in | PR | **`e2e` red on `f4d19b9`, not this PR's change.** One of 67 Playwright tests failed on both attempts: `tests/e2e/living-lexicon.spec.ts:28` (autoplay ping-pongs through the whole Lexicon while visible |

## Gate
Status: awaiting-triage · Rounds: 2 of 2 · Pending verdicts: 0
Evidence: check missing · depcruise missing · coverage-with-db missing · e2e missing · lighthouse missing
Check: commit da14cba touches docs/verification/definition-of-done.md without a Review-Gate trailer · commit f4d19b9 touches README.md without a Review-Gate trailer
