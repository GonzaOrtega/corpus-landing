<!-- review-gate:digest pr-17 -->
# PR #17 · Stabilize Lighthouse and document production abuse controls

## Like you are five
Corpus Landing is the public early-access website for Corpus. It collects signups, lets people manage their subscriptions, and uses required preview checks to keep production changes safe.

This change warms each deployed Preview before Lighthouse measures it and records the production Firewall limit that observes early-access Server Action traffic before enforcement.

We added a little warm-up knock before Lighthouse visits the new Preview, but that knock does not have the key needed to enter a protected Preview. The real Lighthouse visitor has that key, so the fix is to give the warm-up visitor the same key. One smaller note says our test should also check the retry settings. Please decide whether to fix the blocked warm-up now; the retry-test improvement can stay for later.

## In plain words
Round 1 looked at the whole change and found 2 things. I sorted them: 1 to fix now, 1 for later, 0 that do not apply, 0 waiting for you.

- **R-01 · fix** · preview.yml · The new Preview warm-up request cannot access protected Preview deployments, so it can fail the required Lighthouse job before Lighthouse runs. · In scope, in the threat model, important
- **R-02 · later** · lighthouse-config.test.ts · The workflow contract test does not verify the retry settings that make Preview warm-up resilient to a briefly unavailable deployment. · Below the severity floor (important)

## How to answer
Reply `ok` to accept all of it, or override by id: `R-01 fix, R-04 no it is covered by the outbox test`.
To waive a rule, start your message with `skip review-gate` and say why.

## The record
| id | verdict | by | severity | scope | threat | file | summary |
|---|---|---|---|---|---|---|---|
| R-01 | fix | auto | important | in | in | .github/workflows/preview.yml:301 | The new Preview warm-up request cannot access protected Preview deployments, so it can fail the required Lighthouse job before Lighthouse runs. |
| R-02 | later | auto | minor | in | in | tests/unit/lighthouse-config.test.ts:41 | The workflow contract test does not verify the retry settings that make Preview warm-up resilient to a briefly unavailable deployment. |

## Gate
Status: awaiting-triage · Rounds: 1 of 2 · Pending verdicts: 0
Evidence: static-check missing · unit-tests missing · ui-e2e missing · github-required-checks missing · waf-observation-rule missing
Check: commit 1e67067 touches docs/quality/reviews/README.md without a Review-Gate trailer
