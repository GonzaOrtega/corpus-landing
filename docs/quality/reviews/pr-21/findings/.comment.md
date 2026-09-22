<!-- review-gate:digest pr-21 -->
# PR #21 · Add comprehensive test coverage across all layers

## Like you are five
corpus-landing is the public early-access landing page for Corpus, an Android-first language-learning product. It explains the product, collects and confirms email signups, lets a subscriber manage or cancel their own signup through a tokenised link, sends one launch notification, and then flips the whole site into "Get Corpus" mode. It is a Next.js App Router site on Vercel with a Neon Postgres database reached through Drizzle, Resend for email, and a strict hexagonal layout in which the core declares ports, adapters implement them, and only the composition root is allowed to build an adapter. The repository is public, so its history and its documents are part of what it ships.

This pull request turns an existing but unmeasured test suite into a measured and enforced one. It adds a coverage provider, sets a hard threshold for each layer, writes thirty-three new test files and extends fifteen more so those thresholds are honest, and documents the whole scheme. Three things happened after it was first opened. Merging main brought the Sentry observability work inside the measured globs for the first time, which broke four tests and lowered three thresholds. An audit found that seven documents claimed continuous integration enforced this gate when no workflow ran it at all. The gate is now wired for real, both into the continuous integration test job, which is the only job with a database and therefore the only complete measurement, and into the local check command so a breach fails before a push.

This change was supposed to do two things: write a lot of missing tests, and put a
rule in place that says "if any part of the code stops being tested enough, stop
the build". The tests themselves came out well. Three reviewers read them and
agreed: they check that the code behaves correctly, not just that it runs, and
several of them lock in promises that matter, like never writing a subscriber's
email address into an error report.

The rule is the part with problems. Seventeen were found, seven of them worth
your attention, and they fall into one pattern: the rule reports that everything
is fine while checking less than it says it checks.

Three examples. The safety net meant to catch a brand-new untested folder does
not work the way its own comment describes, because the tool averages everything
together instead of looking at that folder on its own; roughly two hundred
completely untested lines could be added before anything complains. The one file
that forwards crash reports to the monitoring service is outside the measured
area entirely, so deleting it would silently switch off error reporting with
nothing turning red. And the file that connects the site to Google's anti-spam
check is deliberately skipped on the grounds that a browser test covers it, but
that browser test always runs with a fake anti-spam check, so nothing exercises
the real one.

There is also one thing that is not about measurement at all, and it is the
reason to stop before running anything. The command you type before pushing,
`bun run check`, now runs the whole test suite. One of those tests empties the
signup table whenever a database address is configured, and it does not check
whether that database is a throwaway one. If your local settings file points at
the shared development database, typing that command deletes its rows. I have
not run it anywhere that could reach a real database, and I have not fixed
anything yet, because the process here is that you decide what gets fixed before
I touch it.

What you have to decide: for each of the seventeen findings, whether it gets
fixed now, deferred to a ticket, or dismissed. The reply format is in the
digest below.

## In plain words
Round 1 looked at the whole change and found 17 things. I sorted them: 7 to fix now, 10 for later, 0 that do not apply, 0 waiting for you.

- **R-01 · fix** · package.json · The `check` command, which used to only inspect the code without touching anything, now runs the whole test suite — and one of those tests empties the signup table of whatever database the developer's local settings point at, which the setup guide says should be the shared Neon development branch. · In scope, in the threat model, important
- **R-02 · later** · testing.md · The coverage documentation assumes a developer machine normally has no database configured, but the project's own setup instructions plus Bun's automatic loading of local settings mean it normally does — so the described difference between a local run and the pipeline, and the warning line the config prints, will rarely apply as written. · Below the severity floor (important)
- **R-03 · later** · CLAUDE.md · Two documents still describe the `check` command as only doing typechecking, linting and structure checks, even though this change makes it also run the entire test suite with coverage; one of them then tells contributors to run that suite a second time. · Below the severity floor (important)
- **R-04 · later** · testing.md · The new rule says a coverage number may only ever go up and that any reduction must be justified on that same page, but this change reduces three of them and records the reason somewhere else, leaving the page claiming the numbers come from a measurement that no longer produced them. · Below the severity floor (important)
- **R-05 · later** · testing.md · The page says the coverage tool is tied to the test runner's major version, but it is actually locked to one exact version while the test runner is allowed to drift within that major, and the tool refuses to work unless the two match exactly. · Below the severity floor (important)
- **R-06 · fix** · vitest.config.ts · The "catch-all" coverage floor does not do what its comment and the testing guide promise: it is a whole-repository average, not a net under directories the named rules miss, so a brand-new folder with no tests at all can ship green. · In scope, in the threat model, important
- **R-07 · fix** · ci.yml · The one job this change designates as the complete coverage measurement still reports success when the disposable database never appeared - it quietly measures less instead of failing. · In scope, in the threat model, important
- **R-08 · later** · drizzle-early-access-signup.repository.test.ts · The stand-in database accepts any sequence of query calls, so the new repository tests raise that file's coverage without checking a single thing about the queries it builds. · Below the severity floor (important)
- **R-09 · later** · config-secrets.test.ts · Several new "fails closed" tests accept any error whatsoever, so they would still pass if the code broke earlier and for an entirely unrelated reason. · Below the severity floor (important)
- **R-10 · later** · page.test.tsx · Three new page tests say they check that every published section is rendered, but they walk a list nothing requires to be non-empty, so emptying the page's content would leave them green. · Below the severity floor (important)
- **R-11 · fix** · vitest.config.ts · The code that fetches a real anti-spam token from Google is left out of the coverage measurement on the grounds that browser tests cover it, but no browser test ever runs it. · In scope, in the threat model, important
- **R-12 · fix** · vitest.config.ts · The gate a developer runs before pushing and the gate the pipeline runs measure different sets of files, so for the database layer the local numbers are set far below what that machine actually achieves. · In scope, in the threat model, important
- **R-13 · fix** · testing.md · The rule that coverage numbers may only ever go up says any lowering must be written down in this document, yet the lowering this change itself performed is not written down there. · In scope, in the threat model, important
- **R-14 · later** · vitest.config.ts · The reason given for skipping the database repository on a developer machine, that it would otherwise look completely untested, is no longer true once this change's own new tests are counted. · Below the severity floor (important)
- **R-15 · fix** · vitest.config.ts · The measured area covers only two folders and one file, so several pieces of live production code at the top of the project are outside the gate entirely, and one of them has no test at all. · In scope, in the threat model, important
- **R-16 · later** · vitest.config.ts · Nothing automatically checks that the agreed minimum for each layer is still respected, so a future change could quietly reduce one and only the written rule would object. · Below the severity floor (important)
- **R-17 · later** · proxy.test.ts · Two of the new proxy tests depend on the exact order of entries in a configuration list, so simply rearranging that list breaks them even though nothing about the behaviour changed. · Below the severity floor (important)

## How to answer
Reply `ok` to accept all of it, or override by id: `R-01 fix, R-04 no it is covered by the outbox test`.
To waive a rule, start your message with `skip review-gate` and say why.

## The record
| id | verdict | by | severity | scope | threat | file | summary |
|---|---|---|---|---|---|---|---|
| R-01 | fix | auto | important | in | in | package.json:32 | The `check` command, which used to only inspect the code without touching anything, now runs the whole test suite — and one of those tests empties the signup table of whatever database the developer's local settings point at, which the setup guide says should be the shared Neon development branch. |
| R-02 | later | auto | minor | in | in | docs/quality/testing.md:112 | The coverage documentation assumes a developer machine normally has no database configured, but the project's own setup instructions plus Bun's automatic loading of local settings mean it normally does — so the described difference between a local run and the pipeline, and the warning line the config prints, will rarely apply as written. |
| R-03 | later | auto | minor | in | in | CLAUDE.md:33 | Two documents still describe the `check` command as only doing typechecking, linting and structure checks, even though this change makes it also run the entire test suite with coverage; one of them then tells contributors to run that suite a second time. |
| R-04 | later | auto | minor | in | in | docs/quality/testing.md:75 | The new rule says a coverage number may only ever go up and that any reduction must be justified on that same page, but this change reduces three of them and records the reason somewhere else, leaving the page claiming the numbers come from a measurement that no longer produced them. |
| R-05 | later | auto | minor | in | in | docs/quality/testing.md:50 | The page says the coverage tool is tied to the test runner's major version, but it is actually locked to one exact version while the test runner is allowed to drift within that major, and the tool refuses to work unless the two match exactly. |
| R-06 | fix | auto | important | in | in | vitest.config.ts:98 | The "catch-all" coverage floor does not do what its comment and the testing guide promise: it is a whole-repository average, not a net under directories the named rules miss, so a brand-new folder with no tests at all can ship green. |
| R-07 | fix | auto | important | in | in | .github/workflows/ci.yml:86 | The one job this change designates as the complete coverage measurement still reports success when the disposable database never appeared - it quietly measures less instead of failing. |
| R-08 | later | auto | minor | in | in | src/adapters/db/drizzle-early-access-signup.repository.test.ts:19 | The stand-in database accepts any sequence of query calls, so the new repository tests raise that file's coverage without checking a single thing about the queries it builds. |
| R-09 | later | auto | minor | in | in | src/composition/capabilities/config-secrets.test.ts:35 | Several new "fails closed" tests accept any error whatsoever, so they would still pass if the code broke earlier and for an entirely unrelated reason. |
| R-10 | later | auto | minor | in | in | app/about/page.test.tsx:11 | Three new page tests say they check that every published section is rendered, but they walk a list nothing requires to be non-empty, so emptying the page's content would leave them green. |
| R-11 | fix | auto | important | in | in | vitest.config.ts:29 | The code that fetches a real anti-spam token from Google is left out of the coverage measurement on the grounds that browser tests cover it, but no browser test ever runs it. |
| R-12 | fix | auto | important | in | in | vitest.config.ts:67 | The gate a developer runs before pushing and the gate the pipeline runs measure different sets of files, so for the database layer the local numbers are set far below what that machine actually achieves. |
| R-13 | fix | auto | important | in | in | docs/quality/testing.md:67 | The rule that coverage numbers may only ever go up says any lowering must be written down in this document, yet the lowering this change itself performed is not written down there. |
| R-14 | later | auto | minor | in | in | vitest.config.ts:8 | The reason given for skipping the database repository on a developer machine, that it would otherwise look completely untested, is no longer true once this change's own new tests are counted. |
| R-15 | fix | auto | important | in | in | vitest.config.ts:60 | The measured area covers only two folders and one file, so several pieces of live production code at the top of the project are outside the gate entirely, and one of them has no test at all. |
| R-16 | later | auto | minor | in | in | vitest.config.ts:100 | Nothing automatically checks that the agreed minimum for each layer is still respected, so a future change could quietly reduce one and only the written rule would object. |
| R-17 | later | auto | minor | in | in | proxy.test.ts:194 | Two of the new proxy tests depend on the exact order of entries in a configuration list, so simply rearranging that list breaks them even though nothing about the behaviour changed. |

## Gate
Status: awaiting-triage · Rounds: 1 of 2 · Pending verdicts: 0
Evidence: check missing · depcruise missing · coverage-with-db missing · e2e missing · lighthouse missing
Check: READY
