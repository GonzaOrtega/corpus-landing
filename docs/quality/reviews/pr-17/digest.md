<!-- review-gate:digest pr-17 -->
# PR #17 · Round 3 review: redirect credential boundary

## Like you are five
Corpus Landing is the public early-access website for Corpus. It collects signups, lets people manage their subscriptions, and uses required preview checks to keep production changes safe.

This change warms each deployed Preview before Lighthouse measures it and records the production Firewall limit that observes early-access Server Action traffic before enforcement.

The warm-up visitor has a secret key. If it follows a sign pointing to someone else's house, it could carry that key there. We should stop it from following redirects, since the Preview address is already the exact page we need to warm.

## In plain words
Round 3 looked at only the fixes from the previous round and found 1 thing. I sorted them: 1 to fix now, 0 for later, 0 that do not apply, 0 waiting for you.

- **R-03 · fix** · preview.yml · The warm-up curl forwards the Vercel Automation Bypass secret to any redirect target. · In scope, in the threat model, important

## How to answer
Reply `ok` to accept all of it, or override by id: `R-01 fix, R-04 no it is covered by the outbox test`.
To waive a rule, start your message with `skip review-gate` and say why.

## The record
| id | verdict | by | severity | scope | threat | file | summary |
|---|---|---|---|---|---|---|---|
| R-01 | fix | human | important | in | in | .github/workflows/preview.yml:301 | The new Preview warm-up request cannot access protected Preview deployments, so it can fail the required Lighthouse job before Lighthouse runs. |
| R-02 | later | human | minor | in | in | tests/unit/lighthouse-config.test.ts:41 | The workflow contract test does not verify the retry settings that make Preview warm-up resilient to a briefly unavailable deployment. |
| R-03 | fix | auto | important | in | in | .github/workflows/preview.yml:301 | The warm-up curl forwards the Vercel Automation Bypass secret to any redirect target. |

## Gate
Status: awaiting-triage · Rounds: 3 of 2 · Pending verdicts: 0
Evidence: static-check missing · unit-tests missing · ui-e2e missing · github-required-checks missing · waf-observation-rule missing
Waivers: round-cap (fix Vercel bypass-cookie redirect loop)
Check: READY
