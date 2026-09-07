# Corpus Landing — Token-Efficient Multi-Model Execution Guide

**Project:** `corpus-landing`  
**Purpose:** Divide the approved implementation into execution packets that can be run independently in Claude Code or Codex while minimizing unnecessary context, expensive-model usage, and repeated reasoning.  
**Source of truth:** `CORPUS_LANDING_FINAL_DESIGN_SPEC.md`  
**Implementation plan:** `CORPUS_LANDING_IMPLEMENTATION_PLAN.md`  
**Last updated:** 2026-09-06

---

## 1. Goal of this document

The approved implementation plan contains 22 tasks. Running all 22 tasks in one long agent session is inefficient: the agent repeatedly carries old context, visual HTML, backend semantics, CI details, and deployment rules even when most of them are irrelevant to the current change.

This guide reorganizes those 22 tasks into **10 execution packets**. Each packet has:

- a narrow implementation boundary;
- the minimum source material the agent should read;
- a recommended executor: Claude Code or Codex;
- a cost-efficient default model tier;
- explicit escalation conditions;
- a completion gate;
- a copy-paste execution prompt.

The product behavior, architecture, design, privacy semantics, and release behavior remain exactly those defined in the final spec and implementation plan. This document changes **execution strategy only**.

---

# 2. Model strategy

Model names below are examples verified as current on 2026-09-06. If a particular client does not expose the exact model name, use the closest equivalent tier available in that client.

## 2.1 Claude Code tiers

| Tier | Suggested model | Use for | Avoid using for |
|---|---|---|---|
| **C0 — Cheap** | Claude Haiku 4.5 | mechanical edits, simple fixtures, metadata, low-risk documentation, repetitive test cases | architecture, security-sensitive flows, concurrency, launch reliability |
| **C1 — Default** | Claude Sonnet 5 | normal implementation, multi-file refactors, frontend work, GSAP integration, ordinary debugging | only the highest-risk delivery/deployment reasoning when a stronger model is justified |
| **C2 — Escalation** | Claude Opus 5 | launch reliability, subtle security/privacy reasoning, production deployment, difficult debugging, final adversarial review | routine scaffolding, CSS cleanup, boilerplate tests |

Claude Code supports selecting a model per session. Prefer switching models between packets rather than keeping an expensive model active for the whole build.

## 2.2 Codex tiers

| Tier | Suggested model | Use for | Avoid using for |
|---|---|---|---|
| **X0 — Cheap** | GPT-5.6 Luna, if exposed by the Codex client | deterministic edits, test expansion, docs, formatting, simple configuration | security-sensitive or ambiguous lifecycle logic |
| **X1 — Default** | GPT-5.6 Terra, if exposed | typed backend work, TDD, Drizzle, repository adapters, Server Actions, CI implementation | the hardest reliability/deployment problems if repeated failures appear |
| **X2 — Escalation** | GPT-5.6 Sol, high reasoning | cross-cutting debugging, concurrency/idempotency, security, production workflows, final audit | mechanical implementation |

If the installed Codex client instead exposes a specialized Codex coding model rather than the GPT-5.6 family, treat the cheaper coding model as X0/X1 and the strongest long-horizon coding model as X2. Do not change the task routing merely because the model labels differ.

## 2.3 Do not default to the strongest model

Use the strongest tier only when one of these is true:

1. The task contains an explicit **never-do-twice** or **fail-closed** invariant.
2. The task involves authorization credentials, PII, token handling, or production secrets.
3. The task changes the production promotion path.
4. A balanced model has failed two focused implementation/debug cycles on the same root cause.
5. The final verification finds a cross-cutting inconsistency that cannot be localized cheaply.

Everything else should start on C0/C1 or X0/X1.

---

# 3. Executor preference

These are workflow preferences, not hard capability boundaries.

## Prefer Claude Code when

- the packet depends heavily on project-local Claude/Claude Stack skills;
- the work is primarily visual React/CSS/GSAP translation;
- the agent needs to compare the implementation directly against the supplied landing/email HTML;
- the work benefits from staying in one coherent frontend/design context.

## Prefer Codex when

- the packet is primarily strict TypeScript domain/application code;
- TDD and focused test loops dominate the work;
- repository/Drizzle/Server Action boundaries are the main concern;
- CI or deployment failures require narrow code-and-log debugging.

Either tool can execute any packet. The important optimization is the **model tier and context boundary**, not the brand of agent.

---

# 4. Token-efficiency rules for every packet

## 4.1 Never preload the entire project specification unless explicitly required

Each agent should read only:

1. `CLAUDE.md` / repository agent instructions;
2. the relevant task range in `CORPUS_LANDING_IMPLEMENTATION_PLAN.md`;
3. the relevant numbered sections in `CORPUS_LANDING_FINAL_DESIGN_SPEC.md` listed in this guide;
4. files already implemented that the current packet directly consumes.

Do **not** paste the entire spec or plan into the prompt. Tell the agent which files and sections to read locally.

## 4.2 Do not carry previous chat transcripts forward

The repository is the handoff.

At the start of each new packet, the agent should inspect:

```bash
git status --short
git log --oneline -8
```

Then read only the current packet's code and tests.

Do not paste the previous agent's full output into the next session.

## 4.3 Use targeted tests first

During a packet:

```text
focused failing test
→ minimal implementation
→ focused passing test
→ packet-level relevant tests
```

Run the expensive full project gates only at designated integration checkpoints.

## 4.4 Keep debugging context narrow

When a command fails, give the debugging model:

- the exact command;
- the relevant error;
- the changed files;
- the immediately related interfaces.

Do not dump entire CI logs or the whole repository unless the failure cannot be localized.

## 4.5 Visual source files are expensive context

Only the visual implementation packet should load `corpus-landing-lexicon.html`.

Only the email packet should load the email HTML references.

Backend, CI, and deployment agents should not read those files.

## 4.6 Strong-model review should be diff-first

When escalating to C2/X2, ask the model to inspect:

```bash
git diff <last-known-good-commit>...HEAD
```

plus the relevant tests and spec sections. Do not make the strong model rediscover the entire implementation from zero.

---

# 5. Critical path

Recommended order:

```text
P0 Bootstrap
  ↓
P1 Core foundation
  ↓
P2 Signup lifecycle
  ↓
P3 Confirmation / manage / maintenance
  ↓
P4 Launch reliability
  ↓
P6 Release-aware UI integration
  ↓
P7 Acceptance gates
  ↓
P8 CI / production operations
  ↓
P9 Final audit
```

The visual packet can run independently after the foundation exists:

```text
P1 Core foundation
  └────────────→ P5 Landing + motion ───────→ P6 Release-aware UI integration
```

If you want parallel execution, **P5 is the safest packet to place in a separate worktree while P2–P4 are implemented**. Merge both lines before P6.

Do not parallelize P2, P3, and P4. They build on the same subscriber/delivery state machine and should be implemented sequentially.

---

# 6. Packet summary

| Packet | Plan tasks | Main concern | Preferred executor | Default tier | Strong-model default? |
|---|---:|---|---|---|---|
| **P0** | 1 | Claude Stack scaffold/conformance | Claude Code | C1 Sonnet 5 | No |
| **P1** | 2–5 | Config, domain, DB, token/logging foundation | Codex | X1 Terra | No |
| **P2** | 6–7 | Join/resubscribe + CAPTCHA/action | Codex | X1 Terra | Escalate only if needed |
| **P3** | 8–10 | Confirmation, manage, retention/cron | Claude Code | C1 Sonnet 5 | No |
| **P4** | 11–12 | Launch idempotency + human-gated send | Codex or Claude Code | X2 Sol / C2 Opus 5 | **Yes** |
| **P5** | 13–15 | Landing shell, GSAP, Living Lexicon | Claude Code | C1 Sonnet 5 | No |
| **P6** | 16–17 | Release-aware UX, legal, SEO | Claude Code | C1 Sonnet 5 | No |
| **P7** | 18 | Playwright/axe/Lighthouse acceptance | Codex | X1 Terra | No |
| **P8** | 19–21 | CI, preview, prod deploy, hardening | Codex | X1 Terra → X2 Sol for Task 20 | Partly |
| **P9** | 22 | Definition-of-Done audit | Opposite vendor from main implementer | C2/X2 | **Yes** |

---

# 7. P0 — Bootstrap and conformance

**Plan task:** 1  
**Preferred:** Claude Code + Claude Sonnet 5  
**Fallback:** Codex + balanced tier  
**Why:** This packet must follow the live Claude Stack birth workflow exactly. A tiny model can save tokens but is more likely to miss a conformance requirement and create expensive cleanup later.

## Read only

From the final spec:

- §13 Architecture
- §14 Suggested source shape
- §16 Styling
- §31 Git model
- §35 Configuration contract
- §36 Dependency policy
- §37 Public-repository security posture
- §40 Deployment-time values intentionally unresolved
- §41 Final Codex instruction

From the plan:

- Task 1 only

External/current source:

- live `GonzaOrtega/claude-stack` `main`
- current `new-project` → `vercel-app` skill

## Do not read yet

- landing prototype HTML;
- email HTML references;
- detailed launch-send semantics;
- full Playwright matrix.

## Completion gate

- repository scaffolded;
- `stack.json` correct;
- dependencies/scripts established;
- Tailwind decision follows live conformance;
- stack conformance, typecheck, and Biome pass;
- one clean commit.

## Copy-paste prompt

```text
Implement Corpus Landing execution packet P0 only.

Read the repository agent instructions, Task 1 of CORPUS_LANDING_IMPLEMENTATION_PLAN.md, and sections 13, 14, 16, 31, 35, 36, 37, 40, and 41 of CORPUS_LANDING_FINAL_DESIGN_SPEC.md.

Use the current merged main of GonzaOrtega/claude-stack as the live architecture authority and follow its new-project -> vercel-app workflow exactly with Playwright and capabilities persistence, external-api, notifications, config-secrets.

Do not implement Tasks 2+ yet. Do not load the landing/email HTML files.

Use the Superpowers workflow required by the plan. Work test/conformance-first. Finish only when the P0 checks pass and commit the packet. Keep your final report to: commit SHA, checks run, files/groups created, and any blocker.
```

---

# 8. P1 — Configuration, domain, persistence, and security primitives

**Plan tasks:** 2–5  
**Preferred:** Codex + GPT-5.6 Terra / balanced coding tier  
**Cheap option:** Use Luna/Haiku only for Task 2 if you want maximum savings, then switch back to the balanced tier for Tasks 3–5.  
**Why:** These tasks are strongly typed and well specified. They need care, but not top-tier open-ended reasoning.

## Read only

From the final spec:

- §3 Product lifecycle
- §6 Signup lifecycle
- §7 Manage Early Access — credential rules only
- §9 Data model
- §13 Architecture
- §14 Suggested source shape
- §15 Required use cases
- §22 Security headers only if config affects Next config
- §23 Error strategy
- §24 Logging
- §35 Configuration contract
- §36 Dependency policy

From the plan:

- Tasks 2–5

## Focus

- validated runtime config;
- exact release-stage semantics;
- domain entity/state types;
- repository port;
- Drizzle schema/migration;
- opaque token generation and SHA-256 hashing;
- Pino redaction/no-PII policy;
- composition providers.

## Escalate to X2/C2 only if

- repository/domain mapping creates contradictory states;
- migration uniqueness semantics do not match the anonymization model;
- token/logging tests expose a security ambiguity not answered by the spec.

## Completion gate

- Tasks 2–5 targeted tests green;
- generated migration checked in;
- no Drizzle types leak into core;
- no PII/token values appear in logs;
- one commit per meaningful task or one packet commit if the plan's TDD steps remain traceable.

## Copy-paste prompt

```text
Implement Corpus Landing packet P1: Tasks 2 through 5 only.

Read the repository instructions, Tasks 2-5 in CORPUS_LANDING_IMPLEMENTATION_PLAN.md, and spec sections 3, 6, 7 (management credential rules only), 9, 13, 14, 15, 23, 24, 35, and 36.

Do not read the visual HTML sources. Do not implement signup behavior, email sending, manage UI, launch sending, or landing UI yet.

Follow the plan's TDD steps exactly. Preserve the Claude Stack core <- adapters <- composition dependency direction. Core may not expose Drizzle rows. Management tokens must be opaque random values with SHA-256 hashes only at rest and raw values never logged.

Run focused tests after each task. At the end run the packet-relevant typecheck/lint/tests, commit the completed packet, and report only the commit SHA, checks, and unresolved blockers.
```

---

# 9. P2 — Idempotent signup/resubscribe and CAPTCHA boundary

**Plan tasks:** 6–7  
**Preferred:** Codex + GPT-5.6 Terra  
**Escalation:** GPT-5.6 Sol high reasoning or Claude Opus 5 for Task 6 only if concurrency/idempotency behavior is not passing cleanly.  
**Why:** The behavior is completely specified, so a balanced model should implement it. The only genuinely difficult area is race-safe join/resubscribe behavior.

## Read only

From the final spec:

- §3 Product lifecycle
- §4 Final early-access copy — response semantics only
- §6 Signup lifecycle
- §7 Manage Early Access — token rotation implications
- §8 CAPTCHA and abuse
- §9.2 Uniqueness
- §11 Confirmation retry policy — only the handoff state needed after join
- §23 Error strategy

From the plan:

- Tasks 6–7

## Focus

Task 6:

- new signup;
- duplicate active signup;
- unsubscribed canonical-row resubscribe;
- management token rotation;
- partial unique-index race handling;
- identical public success result for new/duplicate/resubscribe.

Task 7:

- CAPTCHA port;
- real production adapter;
- deterministic fake adapter outside production;
- Server Action validation;
- launched-stage rejection;
- no enumeration leakage.

## Escalation rule

Start balanced. Upgrade only if:

- the same normalized email can still create two identifiable rows under a race;
- a duplicate/resubscribe path reveals account existence;
- token rotation produces an authorization edge case;
- CAPTCHA/action/hostname validation cannot be reconciled with the adapter contract.

## Completion gate

All Task 6–7 domain/action tests green, including race/idempotency tests and launched-mode rejection.

## Copy-paste prompt

```text
Implement Corpus Landing packet P2: Tasks 6 and 7 only.

Read Tasks 6-7 in the implementation plan and spec sections 3, 4 (public response semantics only), 6, 7 (token rotation implications), 8, 9.2, 11 (only confirmation state immediately following signup), and 23.

Start on the balanced coding model. Do not escalate model strength unless the idempotency/race or authorization semantics fail after two focused attempts.

Do not implement email templates or UI yet. Follow TDD. Preserve the rule that persistence success determines signup success and that public responses never reveal whether an email already existed.

Finish with targeted tests green and a commit. Report only commit SHA, tests, and any semantic issue that required escalation.
```

---

# 10. P3 — Confirmation delivery, management flow, retention, and maintenance

**Plan tasks:** 8–10  
**Preferred:** Claude Code + Claude Sonnet 5  
**Fallback:** Codex balanced tier  
**Why:** This packet spans React Email plus application semantics and a small client/server management bridge. Keeping it in one coherent Sonnet session avoids repeatedly reloading the email and lifecycle context.

## Read only

From the final spec:

- §5 Email contract — confirmation email only
- §6 Signup lifecycle
- §7 Manage Early Access
- §10 Retention and privacy
- §11 Confirmation retry policy
- §13.2 Web vs operations composition
- §23 Error strategy
- §24 Logging

From the plan:

- Tasks 8–10

Visual reference:

- `corpus-email-1-subscribed.html` only

Do not load:

- launch email HTML;
- landing prototype HTML.

## Focus

- React Email confirmation template + plain text;
- Resend adapter with tracking disabled;
- deterministic retry semantics;
- ambiguous outcome handling;
- fragment-based manage credential bridge;
- masked email only;
- explicit unsubscribe action;
- 30-day anonymization;
- production-only cron entrypoint with aggregate output and no PII.

## Escalate to Opus/Sol only if

- provider ambiguity handling could cause duplicate confirmation mail;
- management fragment handling leaks the token into logs or URL requests;
- retention rules create an unresolved current-state ambiguity.

## Completion gate

Tasks 8–10 tests green, email rendering tests green, raw tokens absent from server URLs/logs, cron route contains no business logic.

## Copy-paste prompt

```text
Implement Corpus Landing packet P3: Tasks 8 through 10 only.

Read the repository instructions, Tasks 8-10 of the implementation plan, spec sections 5 (confirmation email only), 6, 7, 10, 11, 13.2, 23, and 24, plus corpus-email-1-subscribed.html as the visual source for the confirmation email.

Do not load the launch email or landing prototype. Do not implement launch-send operations or homepage UI.

Preserve the exact two-message product contract, retry limit of 3, ambiguous-delivery safety rule, fragment-only raw management token, masked email, explicit unsubscribe, 30-day anonymization, and PII-free cron/log output.

Follow TDD and commit once packet tests/render tests pass. Final response: commit SHA, checks, blockers only.
```

---

# 11. P4 — Launch email reliability and human-gated operations

**Plan tasks:** 11–12  
**Preferred strong model:** Codex + GPT-5.6 Sol high reasoning **or** Claude Code + Claude Opus 5  
**This is intentionally a strong-model packet.**  
**Why:** “Never send the launch notification twice” is the highest-risk business invariant in the application. A false retry is worse than a missed automatic delivery.

## Read only

From the final spec:

- §5.2 Launch email
- §5.3 Template technology
- §5.4 Email configuration
- §10.1 Successful launch recipient
- §12 Launch-send reliability
- §13.2 Web vs operations composition
- §24 Logging
- §31 Git model
- §32 Production deployment — only boundaries relevant to workflow protection
- §35 Configuration contract
- §37 Public-repository security posture
- §38 Codex decision boundary

From the plan:

- Tasks 11–12

Visual reference:

- `corpus-email-2-ready.html` only

## Focus

- typed launch-template inputs;
- no arbitrary HTML from workflow input;
- dry run with no subscriber mutation;
- exact input/version matching between dry run and send;
- per-recipient `pending/sending/sent/failed/manual_review` semantics;
- deterministic idempotency key `corpus-launch-v1/<signup-id>`;
- safe ambiguous-response handling;
- GitHub Environment + workflow_dispatch + concurrency protection;
- no PII in logs/artifacts.

## Completion gate

Do not consider this packet complete until tests prove:

1. provider accepted → exactly one `sent` transition;
2. known failure → `failed`;
3. ambiguous within idempotency window → resumable with same key;
4. ambiguous after window → `manual_review`;
5. dry run never mutates subscriber launch state;
6. production run cannot proceed without matching dry run inputs/version.

## Copy-paste prompt

```text
Implement Corpus Landing packet P4: Tasks 11 and 12 only.

Use a strong reasoning/coding model for this packet. Read Tasks 11-12 in the plan, spec sections 5.2, 5.3, 5.4, 10.1, 12, 13.2, 24, 31, 32 (workflow/deployment protection boundary only), 35, 37, and 38, plus corpus-email-2-ready.html.

The primary invariant is: never send the launch notification twice, even if an ambiguous recipient must move to manual_review.

Do not implement frontend landing work. Do not broaden the email system into campaigns or arbitrary HTML. Implement and test the dry-run gate, deterministic idempotency key, per-recipient state transitions, ambiguous outcome handling, and protected workflow exactly as specified.

Before committing, run all launch-delivery tests plus relevant type/lint checks. Final report must be concise: commit SHA, invariant tests proven, workflow files changed, blockers.
```

---

# 12. P5 — Landing visual shell, GSAP choreography, and interactive demos

**Plan tasks:** 13–15  
**Preferred:** Claude Code + Claude Sonnet 5  
**Escalation:** Claude Opus 5 only for unresolved visual/interaction fidelity or difficult GSAP lifecycle bugs.  
**Why:** This is the only packet that needs the full landing visual source in context. Keep that expensive context isolated from all backend work.

## Read only

From the final spec:

- §1 Goal
- §2.1 Landing
- §2.4 Brand
- §16 Styling
- §17 Rendering and motion
- §18 Demo content
- §19 Accessibility
- §20 Browser support

From the plan:

- Tasks 13–15

Visual sources:

- `corpus-landing-lexicon.html`
- approved Corpus mark assets from the main Corpus repo

Do not read:

- database schema details;
- email retry/launch reliability internals;
- CI/deployment sections except basic browser requirements.

## Focus

- static/server-rendered shell first;
- exact section order/copy;
- Newsreader/Karla via `next/font/google`;
- CSS-first implementation;
- no Tailwind utility translation;
- bounded GSAP client islands;
- reduced motion;
- progressive enhancement;
- sticky header/progress spine;
- Capture → Enrich → Practice scrollytelling;
- Living Lexicon controls;
- cloze interaction;
- philosophy inversion;
- responsive behavior.

## Token-saving tactic

Do Tasks 13–15 in the **same Claude Code session** so the landing HTML only has to be parsed once.

Do not ask a second agent to independently re-read the entire prototype unless the first implementation fails visual QA.

## Completion gate

- visual/interaction behavior matches prototype intent;
- keyboard paths work;
- reduced-motion mode retains all meaning;
- no second animation framework;
- no runtime Google Fonts request;
- no backend/email logic pulled into visual components.

## Copy-paste prompt

```text
Implement Corpus Landing packet P5: Tasks 13 through 15 only.

Read Tasks 13-15 of the plan and spec sections 1, 2.1, 2.4, 16, 17, 18, 19, and 20. Load corpus-landing-lexicon.html and the approved Corpus mark/brand assets. Treat them as authoritative visual sources: no redesign and no copy rewrite.

Stay in one session for all three tasks so the visual source is parsed only once. Use Server Components/static rendering by default and bounded client islands for GSAP/interactions. CSS-first; no Tailwind utility translation and no second animation framework.

Preserve keyboard behavior, reduced motion, progressive enhancement, responsive intent, Living Lexicon, cloze, scrollytelling, sticky header, progress spine, and theme inversion.

Do not implement backend lifecycle/email/CI work in this packet. Finish with targeted UI/unit checks and a commit. Final response: commit SHA, visual surfaces implemented, checks, blockers.
```

---

# 13. P6 — Release-aware UI, legal pages, SEO, and indexing behavior

**Plan tasks:** 16–17  
**Preferred:** Claude Code + Claude Sonnet 5 at low/medium effort  
**Cheap subtask option:** Metadata/robots/sitemap boilerplate can be delegated to Haiku/Luna after the release-aware behavior is already correct.  
**Why:** The code is straightforward, but legal text must accurately reflect actual implemented behavior, so the whole packet should not be handed to the cheapest tier without review.

## Read only

From the final spec:

- §3 Product lifecycle
- §4 Final early-access copy
- §6 Signup lifecycle — public UX implications
- §7 Manage Early Access — display copy
- §19 Accessibility
- §21 SEO
- §22 Security headers
- §25 Analytics
- §26 Legal pages
- §34 Runtime environments
- §35 Configuration contract

From the plan:

- Tasks 16–17

Existing code:

- P2 signup Server Action contract;
- P5 landing UI components;
- P3 management flow behavior.

## Focus

- early-access vs launched CTA surfaces;
- server-side rejection remains authoritative;
- exact signup copy;
- no enumeration leakage;
- accessible status/error feedback;
- privacy/terms matching implementation, not aspirational behavior;
- canonical metadata;
- preview/local/test noindex;
- production index/follow;
- deterministic social preview;
- Vercel Analytics + Speed Insights only;
- CSP/security headers.

## Completion gate

Both release stages render correctly, stale signup submission is rejected in launched mode, legal copy matches implemented data flows, indexing rules differ correctly by environment.

## Copy-paste prompt

```text
Implement Corpus Landing packet P6: Tasks 16 and 17 only.

Read Tasks 16-17 in the plan and spec sections 3, 4, 6 (public UX implications), 7 (manage-page copy), 19, 21, 22, 25, 26, 34, and 35. Reuse the already implemented P2 signup contract, P3 management behavior, and P5 landing components.

Do not redesign or rewrite product copy. Make UI/metadata/legal surfaces accurately reflect the behavior already implemented. Early-access and launched modes must differ only where the spec allows.

Use a balanced model. You may delegate purely mechanical sitemap/robots/metadata boilerplate to a cheaper model, but review it in this session before commit.

Run focused UI/config tests and commit. Final report: commit SHA, release-stage checks, legal/SEO checks, blockers.
```

---

# 14. P7 — Acceptance tests, accessibility, and Lighthouse

**Plan task:** 18  
**Preferred:** Codex + GPT-5.6 Terra  
**Cheap option:** Once the first representative tests establish patterns, repetitive matrix expansion can move to Luna/Haiku and then be reviewed by the balanced model.  
**Why:** Most work is deterministic test authoring. Expensive reasoning is only needed when a browser-specific failure exposes a real implementation defect.

## Read only

From the final spec:

- §19 Accessibility
- §20 Browser support
- §27 CI — required check naming context
- §28 Playwright acceptance matrix
- §29 Automated accessibility checks
- §30 Lighthouse CI
- §39 Definition of done — only testable UI gates

From the plan:

- Task 18

Existing code:

- current routes/components/actions;
- test helpers/fakes;
- no need to reload the HTML prototypes unless a visual assertion cannot be understood from implemented behavior.

## Focus

- Chromium full critical suite;
- Firefox/WebKit smoke/critical interactions;
- mobile emulation;
- signup/manage/release modes;
- reduced motion;
- no real preview email/CAPTCHA;
- axe surfaces;
- Lighthouse 3-run median thresholds.

## Escalate only if

- WebKit/Firefox behavior differs in a way that requires architectural code changes;
- accessibility failure cannot be localized;
- Lighthouse failure requires nontrivial rendering/performance redesign.

## Completion gate

Task 18 suite exists and passes locally against the appropriate environment/fakes to the extent infrastructure permits.

## Copy-paste prompt

```text
Implement Corpus Landing packet P7: Task 18 only.

Read Task 18 in the plan and spec sections 19, 20, 27 (check-name context only), 28, 29, 30, and the testable UI items in 39.

Use the balanced coding model to establish representative Playwright and axe patterns. After the pattern is proven, repetitive scenario expansion may use a cheaper model, but review the resulting tests before commit.

Do not change product behavior to make tests easier. A failing acceptance test should expose an implementation problem or an incorrect test assumption; resolve against the spec.

Commit when the acceptance/a11y/Lighthouse configuration and locally runnable tests are green. Report only commit SHA, scenario coverage, test commands/results, blockers.
```

---

# 15. P8 — CI, preview isolation, production deployment, and repository hardening

**Plan tasks:** 19–21  
**Preferred:** Codex  
**Model split:**

- Task 19 → X1 Terra / balanced tier
- Task 20 → **X2 Sol high reasoning or C2 Opus 5**
- Task 21 → X0/X1 for docs/config, then X2/C2 diff review if production controls changed

**Why:** CI YAML and preview automation are mostly deterministic. The explicit production stage/smoke/promote workflow is high risk and deserves the stronger model by default.

## Read only

From the final spec:

- §27 CI
- §30 Lighthouse CI
- §31 Git model
- §32 Production deployment
- §33 Preview/CI database automation
- §34 Runtime environments
- §35 Configuration contract
- §36 Dependency policy
- §37 Public-repository security posture
- §39 Definition of done — operational gates
- §40 Deployment-time values intentionally unresolved

From the plan:

- Tasks 19–21

## Task 19 model rule

Use balanced tier.

Focus on:

- stable check names `check`, `test`, `preview`, `e2e`, `lighthouse`;
- disposable Neon branches;
- `development` as parent for temporary branches;
- cleanup paths;
- fake email/CAPTCHA in preview/CI;
- noindex preview;
- SHA-pinned actions.

## Task 20 model rule

Switch to the strong tier **before editing production deployment**.

Focus on:

1. exact main SHA verification;
2. production migration via unpooled URL;
3. stage Vercel deployment without domain;
4. smoke test;
5. re-verify main SHA;
6. zero-rebuild promote;
7. concurrency protection;
8. rollback documentation;
9. expand → deploy → contract discipline.

## Task 21 model rule

Return to balanced/cheap tier for documentation and public-repo hygiene. Use the strong model only for a final diff review of security/deployment-sensitive files.

## Completion gate

All workflow files parse, required names are stable, preview isolation is explicit, production cannot be changed merely by merging, no secret-bearing value is committed, rollback is documented.

## Copy-paste prompt

```text
Implement Corpus Landing packet P8: Tasks 19 through 21 only.

Read Tasks 19-21 in the plan and spec sections 27, 30, 31, 32, 33, 34, 35, 36, 37, the operational items in 39, and section 40.

For Task 19 use the balanced coding model. Implement stable check names, disposable Neon preview/CI branches from development, cleanup, preview deployment, fake email/CAPTCHA, noindex, E2E and Lighthouse wiring, and SHA-pinned Actions.

Before Task 20, switch to the strongest coding/reasoning tier. Treat production deployment as high risk: exact main SHA -> production unpooled migration -> staged Vercel deployment without domain -> smoke -> reverify SHA -> zero-rebuild promote. Merge to main must not automatically change production.

For Task 21 you may return to a balanced/cheap model for safe public documentation/hardening, then perform a strong-model diff review of security/deployment-sensitive files before commit.

Do not invent unresolved real deployment values. Finish with workflow/config validation and commits. Report only SHAs, checks, production invariants verified, blockers.
```

---

# 16. P9 — Final Definition-of-Done audit

**Plan task:** 22  
**Preferred:** Strongest practical model from the **other vendor/tool** than the one that implemented most of the code.  
**Examples:**

- if most implementation used Codex → Claude Code + Opus 5;
- if most implementation used Claude Code → Codex + GPT-5.6 Sol high reasoning.

**Why:** Cross-model review is useful here because it reduces the chance that the same implementation habits produce the same blind spots during final review. This packet should spend expensive tokens on **verification**, not on rewriting working code.

## Read

Unlike earlier packets, final audit may read:

- the full final spec;
- Task 22 and the final plan checklist;
- repository diff/history;
- all verification configs;
- only the implementation files implicated by findings.

Do **not** preload every source file into context. Let the reviewer navigate from the Definition of Done to evidence.

## Audit method

For each Definition-of-Done item, record:

```text
PASS — command/evidence
FAIL — exact reason
BLOCKED — missing external credential/environment/value
```

Never turn `BLOCKED` into `PASS`.

## Strong-model token rule

The reviewer should first inspect evidence and tests. It should open implementation code only when:

- a gate fails;
- a behavior is not covered;
- a security/privacy invariant requires manual inspection.

## Fix policy

- Small localized fix: repair in the same strong-model session.
- Mechanical follow-up with obvious solution: hand back to X0/C0 or X1/C1, then rerun the failed gate.
- Cross-cutting architectural defect: keep strong tier and fix before completion.

## Completion gate

All locally provable Definition-of-Done items are PASS. Items requiring unresolved deployment-time credentials may be BLOCKED with exact setup requirements, but must not be falsely marked complete.

## Copy-paste prompt

```text
Run Corpus Landing packet P9: Task 22 final Definition-of-Done audit.

Use the strongest practical model, preferably from the opposite tool/vendor from the majority of implementation work.

Read the full CORPUS_LANDING_FINAL_DESIGN_SPEC.md, Task 22 and the final checklist in CORPUS_LANDING_IMPLEMENTATION_PLAN.md, git history/diff, and verification configuration. Do not read every implementation file up front; navigate from each Definition-of-Done requirement to tests/evidence and open code only where needed.

For every DoD item output PASS with evidence, FAIL with exact reason, or BLOCKED with the precise missing external dependency. BLOCKED is never PASS.

Run the required verification commands. Fix only concrete failures. Delegate purely mechanical fixes back to a cheaper model if doing so does not lose context or safety. Re-run every failed gate after repair.

Do not claim completion until all locally provable gates pass. Finish with a compact audit table, final commit SHA, remaining external deployment blockers, and no narrative recap.
```

---

# 17. Recommended cheapest safe route

If the goal is to minimize expensive-model use without being reckless, use this sequence:

| Packet | Tool/model |
|---|---|
| P0 | Claude Code — Sonnet 5 |
| P1 | Codex — Terra |
| P2 | Codex — Terra; escalate Task 6 only if needed |
| P3 | Claude Code — Sonnet 5 |
| P4 | **Codex Sol high OR Claude Opus 5** |
| P5 | Claude Code — Sonnet 5 |
| P6 | Claude Code — Sonnet 5 low/medium |
| P7 | Codex — Terra; cheap tier for repetitive expansion after pattern is proven |
| P8 Task 19 | Codex — Terra |
| P8 Task 20 | **Codex Sol high OR Claude Opus 5** |
| P8 Task 21 | Codex Terra/Luna + strong diff review |
| P9 | **Strong opposite-vendor model** |

This keeps top-tier models concentrated in only three places:

1. launch-send reliability;
2. production deployment;
3. final audit.

Everything else starts on a balanced or cheap tier and escalates only on evidence.

---

# 18. Optional parallel route

After P1 is complete:

## Backend worktree

```text
P2 → P3 → P4
```

Use Codex/Claude according to the packet table.

## Frontend worktree

```text
P5
```

Use Claude Code Sonnet 5.

Then merge both worktrees and continue:

```text
P6 → P7 → P8 → P9
```

### Why this is the only recommended parallel split

P5 mostly touches:

- brand assets;
- landing components;
- CSS;
- motion controllers;
- static demo content.

P2–P4 mostly touch:

- core use cases;
- persistence;
- Server Actions;
- email adapters/templates;
- management lifecycle;
- operations.

The overlap is much lower than trying to parallelize subscriber lifecycle tasks with one another.

---

# 19. Model escalation protocol

When a packet fails, do not immediately restart it with the strongest model.

Use this ladder:

```text
1. Same model, focused test + exact error
2. Same model, inspect minimal related diff/interfaces
3. Balanced model if currently cheap
4. Strong model with diff + failing test only
5. Strong model with broader spec slice only if root cause is genuinely cross-cutting
```

A strong-model escalation prompt should look like:

```text
Review this specific failed invariant only.

Spec sections: <numbers>
Plan task: <number>
Last known good commit: <sha>
Current commit: <sha>
Failing command: <command>
Failure: <short exact error>

Inspect the diff and directly related files. Identify root cause first. Do not rewrite unrelated code. Fix minimally, rerun the focused test, then the packet gate.
```

This is substantially more token-efficient than asking a new high-tier agent to “review the whole project.”

---

# 20. Handoff contract between packets

Each packet should end with a compact final response in this exact shape:

```text
Packet: P<n>
Commit: <sha>
Checks: <commands + PASS/FAIL>
Key outputs: <max 5 bullets>
Blockers: <none or exact blocker>
Next: P<n+1>
```

The next agent should **not** receive the previous transcript. It should read the commit and repository state.

This keeps handoff context bounded and reproducible.

---

# 21. What not to do for token efficiency

Do not:

- run Opus/Sol for all 22 tasks;
- ask every agent to summarize the complete spec before coding;
- paste the full spec and plan into every prompt;
- make backend agents parse the landing HTML;
- make frontend agents reason through launch idempotency;
- rerun the entire Playwright matrix after every unit-level change;
- use multiple agents to independently solve the same task before any failure exists;
- carry long chat transcripts between models;
- ask the final strong-model reviewer to rewrite code that already has passing evidence;
- use subagents for tiny deterministic steps where coordination costs more tokens than the work itself.

---

# 22. What is worth spending more tokens on

Spend high-tier reasoning on:

- partial-unique-index + resubscribe race semantics if tests expose a problem;
- raw management-token secrecy and fragment handling if authorization behavior is uncertain;
- ambiguous provider delivery outcomes;
- launch idempotency/manual-review transitions;
- production stage/smoke/promote workflow;
- cross-browser or accessibility defects that require architectural changes;
- final Definition-of-Done verification.

Those are the areas where a cheaper wrong answer is likely to cost more than a stronger initial pass.

---

# 23. Final operating rule

> Use the cheapest model that can safely complete the current packet, not the cheapest model that can produce code.

The expensive part of agentic implementation is not generating TypeScript. It is recovering from a subtle incorrect assumption after that assumption has propagated through several later tasks.

Keep context narrow, test after every packet, commit cleanly, and escalate model strength only at the points where the specification contains a high-cost invariant or the evidence shows that the current tier is insufficient.
