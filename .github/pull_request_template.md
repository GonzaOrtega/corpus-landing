## What this changes

<!-- One paragraph. What behaviour is different after this merges? -->

## Plan reference

- Packet: <!-- P0 … P9 -->
- Task(s): <!-- e.g. Task 6, Task 7 -->
- Spec section(s): <!-- e.g. §6.1, §9.2 -->

## Public-repository safety

This repository is private today and public later. History is permanent.

- [ ] No real email addresses, connection strings, API keys, or tokens — in
      source, fixtures, tests, logs, snapshots, or workflow YAML
- [ ] New configuration is names-only in `.env.example`
- [ ] No PII written to logs or analytics

## Verification

<!-- Paste actual command output. "Should pass" is not verification. -->

- [ ] `bun run check` (typecheck + lint + stack conformance)
- [ ] `bun run test`
- [ ] `bun run e2e` — or N/A, because:
- [ ] Manual visual QA — or N/A, because:

## Semantics guarded

Tick only what applies; leave the rest blank.

- [ ] Signup remains **idempotent** — a repeat submit creates no second record
- [ ] Launch send remains **never-twice** per recipient
- [ ] Retention/anonymization rules unchanged, or changed deliberately and documented
- [ ] Migration follows expand → deploy → contract
