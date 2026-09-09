# Corpus Landing — Final Design Specification

**Project:** `corpus-landing`  
**Status:** final design review draft  
**Implementation owner:** Codex after approval  
**Repository:** new public GitHub repository, `GonzaOrtega/corpus-landing`  
**License:** MIT  
**Deployment:** Vercel  
**Database:** dedicated Neon PostgreSQL project  
**Package manager:** Bun  
**Architecture:** Claude Stack `new-project` → `vercel-app`, `kind: next-app`  
**Capabilities:** `persistence`, `external-api`, `notifications`, `config-secrets`  
**Last updated:** 2026-09-06

---

# 1. Goal

Build a standalone public web application that explains Corpus, collects early-access signups, confirms those signups, lets subscribers securely manage/unsubscribe, sends one eventual launch notification, and then transitions the public site from “early access” to “Get Corpus” mode.

Codex is responsible for **implementation and verification only**.

Codex must not invent:

- product behavior;
- copy;
- visual direction;
- page structure;
- motion direction;
- email semantics;
- persistence semantics;
- privacy policy behavior;
- retention behavior;
- deployment topology;
- release workflow;
- architecture boundaries.

Where this document leaves an implementation detail unconstrained, Codex should follow the current Claude Stack `next-app` blueprint and current production standards.

---

# 2. Visual sources of truth

## 2.1 Landing

The supplied `corpus-landing-lexicon.html` is the authoritative visual and interaction specification.

Preserve:

- section order;
- hero structure;
- Corpus geometric mark treatment;
- paper / ink / clay palette;
- Newsreader + Karla typography;
- fluid type and spacing proportions;
- sticky header;
- progress spine;
- hero geometry;
- typed `lucent` demonstration;
- Capture → Enrich → Practice scrollytelling;
- Living Lexicon behavior;
- philosophy theme inversion;
- early-access section layout;
- footer;
- responsive breakpoints/intent;
- keyboard behavior;
- reduced-motion behavior;
- progressive-enhancement behavior;
- GSAP choreography.

Implementation adaptations are allowed only when required for:

- React/Next.js semantics;
- accessibility;
- browser correctness;
- progressive enhancement;
- performance;
- security.

No redesign.

## 2.2 Confirmation email

The supplied `corpus-email-1-subscribed.html` is the authoritative visual reference.

Preserve:

- masthead;
- vertical spine;
- Newsreader/Karla hierarchy;
- paper/clay/night palette;
- “lucent” specimen panel;
- Capture / Enrich / Practice section;
- footer structure;
- dark-mode email behavior.

Change only copy made obsolete by the final two-message email contract.

## 2.3 Launch email

The supplied `corpus-email-2-ready.html` is the authoritative visual reference.

Preserve:

- masthead;
- announcement spine;
- “It’s ready to try.” hierarchy;
- “In the first build” panel;
- “What isn’t there yet” section;
- closing “Structure creates freedom.” line;
- footer structure;
- dark-mode behavior.

Remove:

- email-tied access statement;
- hard-coded Google Play assumption.

## 2.4 Brand

The main Corpus repository remains canonical for the Corpus mark and brand identity.

The landing repo snapshots approved brand assets into itself. It has no runtime/build dependency on the main Corpus repository.

---

# 3. Product lifecycle

The site has exactly two release stages:

```text
early-access
launched
```

Validated server configuration:

```text
CORPUS_RELEASE_STAGE=early-access | launched
CORPUS_DOWNLOAD_URL=<required only when launched>
```

## 3.1 Early-access mode

- Hero primary CTA: `Join early access`
- Header CTA: `Join early access`
- Signup form is visible
- Server accepts early-access submissions
- Metadata describes private development / early access

## 3.2 Launched mode

Preserve the same landing experience.

Only early-access surfaces change:

- Hero primary CTA → `Get Corpus`
- Header CTA → `Get Corpus`
- Hero private-development note becomes launch/platform availability copy
- Bottom Early Access section becomes a Get Corpus section
- Email form and consent text disappear
- CTA destination = validated `CORPUS_DOWNLOAD_URL`
- Server rejects new early-access submissions
- SEO metadata becomes launched-product wording

The following stay intact:

- hero visual;
- product explanation;
- scrollytelling;
- Living Lexicon;
- philosophy section;
- motion choreography.

---

# 4. Final early-access copy

## 4.1 Signup section

Eyebrow:

> Early access

Heading:

> Be there for the first build.

Body:

> Corpus is still in private development. Leave your email and we'll let you know when there's a build worth trying.

CTA:

> Join the list

Consent:

> By joining, you agree to receive a confirmation email and one launch notification when Corpus is ready. No newsletter. Unsubscribe anytime.

Success:

> You're on the list. Check your inbox for confirmation — we'll write again when Corpus is ready.

Invalid email:

> That address looks incomplete. Check it and try again.

Generic CAPTCHA/server failure:

> We couldn't complete that signup. Please try again.

Duplicate active signup:

Return the same normal success state. Do not reveal that the address already existed.

Resubscribe:

Return the same normal success state. A fresh confirmation email is sent.

Launched-mode submission:

Reject server-side even if a stale client still submits.

Public wording must not reveal whether an email exists in the database.

---

# 5. Email contract

The subscriber receives at most the intended two product messages:

1. immediate signup confirmation;
2. one eventual launch notification.

No newsletter.
No drip sequence.
No behavioral tracking.
No marketing campaign system.

## 5.1 Confirmation email

Subject:

> You're on the list for Corpus

Preheader:

> You're confirmed. We'll write once more when Corpus is ready to try.

Heading:

> You're on the list.

Intro:

> Corpus is still in private development. You're confirmed for early access. We'll write again when there's a build worth trying. Early access begins on Android.

Secondary:

> That's the whole commitment. No newsletter, no drip sequence.

Keep the existing `lucent` specimen and Capture / Enrich / Practice sections.

Footer meaning:

> You're receiving this because you asked for early access to Corpus. We'll send one more email when there's a build worth trying.

Management link label:

> Manage early access

## 5.2 Launch email

Visual structure is fixed in code.

Permanent template structure includes:

- subject/preheader pattern;
- `It's ready to try.`;
- core intro;
- `Get Corpus` CTA;
- `In the first build`;
- `What isn't there yet`;
- reply/support statement;
- Manage Early Access footer.

Release-specific content is supplied as typed, validated inputs:

- release summary;
- included-feature bullet list;
- known-limitations list.

No arbitrary HTML/body input from GitHub Actions.

The release destination is provider-agnostic.

The template must not say access is tied to the signup email.

## 5.3 Template technology

Use React Email `.tsx` templates.

No Tailwind in email templates.
No Resend visual-editor-owned source of truth.

Both emails also have explicit plain-text renderings.

## 5.4 Email configuration

Runtime configuration:

```text
EMAIL_FROM
REPLY_TO
EMAIL_POSTAL_ADDRESS
```

Use a dedicated verified Resend sending subdomain.

Real values never enter Git.

Open tracking: disabled.
Click tracking: disabled.

Replies go to a monitored `REPLY_TO` inbox.

---

# 6. Signup lifecycle

## 6.1 New signup

1. Browser validates basic form UX.
2. Production browser obtains score-based reCAPTCHA token.
3. Server Action parses input with Zod.
4. Server verifies release stage is `early-access`.
5. Server verifies CAPTCHA.
6. Email is trimmed.
7. `email_normalized` = lowercase(trimmed email).
8. Use case performs idempotent join.
9. Neon persistence succeeds.
10. Signup is considered successful.
11. Confirmation email is attempted.
12. Public UI receives normal success state regardless of duplicate/new distinction.

Neon persistence, not Resend delivery, determines signup success.

## 6.2 Duplicate active signup

Same normalized email:

- no second row;
- no enumeration response;
- if confirmation already sent: do not send again;
- if confirmation has a known retryable failure and attempts remain: retry policy may continue.

## 6.3 Unsubscribe

The Manage Early Access surface requires an explicit action.

A page view never unsubscribes.

Set current `unsubscribed_at`.

Subscriber becomes ineligible for launch mail immediately.

## 6.4 Resubscribe

If an unsubscribed, still-identifiable address submits the form again:

- reuse same canonical row;
- clear current `unsubscribed_at`;
- rotate management token;
- refresh consent version/time;
- restore launch eligibility;
- send fresh confirmation;
- return normal success state.

## 6.5 Anonymized historical signup

After anonymization, email fields are null.

A later signup with the same address is a new signup because the system intentionally no longer retains an identifier capable of linking the person to the old row.

---

# 7. Manage Early Access

Route:

```text
/early-access/manage
```

Visual direction: sparse, editorial, same Corpus system.

Content for active subscription:

- Corpus mark
- `Manage early access.`
- masked email, e.g. `g***@example.com`
- `You're on the Corpus early-access list.`
- `We'll send one launch notification when Corpus is ready. No newsletter.`
- primary `Unsubscribe`
- secondary `Back to Corpus`

After unsubscribe:

> You're off the list.

> You won't receive the Corpus launch email.

Invalid/anonymized/invalidated credential:

> This management link is no longer valid.

Never display full email.

## 7.1 Management credential

Use a cryptographically random opaque token.

Database stores only SHA-256 token hash.

Do not derive authorization from signup UUID.

Token is rotated on resubscribe and removed on anonymization.

After unsubscribe, the token may remain usable during the 30-day retention window only to render the already-unsubscribed state.

## 7.2 Keep token out of URL logs

The raw management token must not be sent to the server as a URL path/query parameter.

Email management links use the URL fragment:

```text
https://<site>/early-access/manage#<opaque-token>
```

Fragments are not sent in the HTTP request.

A small client island reads the fragment and submits it to a read-only Server Action to resolve management state.

Unsubscribe uses a separate explicit Server Action.

After reading the fragment, the client removes it from the visible browser URL with `history.replaceState`.

Never log the raw token.

---

# 8. CAPTCHA and abuse

Production:

- Google reCAPTCHA Essentials
- score-based/no visible challenge
- dedicated action: `early_access_signup`
- server-side verification
- validate expected action
- validate expected site/hostname data where provider response supports it
- default threshold: `0.5`

Configuration:

```text
RECAPTCHA_SCORE_THRESHOLD=0.5
```

Invalid token, wrong action, failed verification, or score below threshold:

- fail closed;
- return one generic retry state;
- do not reveal the reason.

Do not persist:

- CAPTCHA token;
- CAPTCHA score;
- IP address;
- user agent;
- referrer;
- UTM parameters.

Local/CI/Preview:

- deterministic non-network `CaptchaVerifier` adapter;
- no real Google credential required.

No dedicated rate-limit SaaS in v1.

---

# 9. Data model

Dedicated Neon project for `corpus-landing`.

Long-lived Neon branches:

```text
main         production
development  local/manual non-production
```

PR and CI branches are disposable.

## 9.1 Table

One table:

```text
early_access_signups
```

Recommended fields:

```text
id                              uuid primary key

email_original                  text null
email_normalized                text null

consent_version                 text not null
consented_at                    timestamptz not null

created_at                      timestamptz not null
updated_at                      timestamptz not null

unsubscribed_at                 timestamptz null
anonymized_at                   timestamptz null

manage_token_hash               text null

confirmation_status             enum(pending,sent,failed,exhausted)
confirmation_attempt_count      integer not null default 0
confirmation_last_attempt_at    timestamptz null
confirmation_next_attempt_at    timestamptz null
confirmation_sent_at            timestamptz null

launch_status                   enum(pending,sending,sent,failed,manual_review)
launch_attempt_count            integer not null default 0
launch_last_attempt_at          timestamptz null
launch_sent_at                  timestamptz null
```

No generic overall subscription `status`.

Current subscription state is derived from lifecycle facts.

## 9.2 Uniqueness

Application handles idempotent join/resubscribe semantics.

PostgreSQL is the final race-condition guard.

Create a partial unique index equivalent to:

```text
unique(email_normalized)
where anonymized_at is null and email_normalized is not null
```

This permits anonymized historical rows while preventing two identifiable current rows for the same normalized email.

## 9.3 Persistence

Use Drizzle ORM.

Schema changes only through generated Drizzle migrations.

Core never exposes Drizzle rows.

Repository adapter maps database rows to `EarlyAccessSignup`.

---

# 10. Retention and privacy

## 10.1 Successful launch recipient

After `launch_sent_at` is older than 30 days:

anonymize:

- `email_original = null`
- `email_normalized = null`
- `manage_token_hash = null`
- set `anonymized_at`

May retain non-identifying lifecycle/delivery timestamps and counters.

Do not retain email hash.

## 10.2 Pre-launch unsubscribe

Thirty days after `unsubscribed_at`, if not resubscribed:

anonymize the same identifying fields even if Corpus has not launched.

## 10.3 Automated maintenance

Use Vercel Cron, not scheduled GitHub Actions.

Vercel Cron schedule:

```text
once daily
```

Protected production-only route:

```text
/api/cron/maintenance
```

The route:

1. verifies `Authorization: Bearer <CRON_SECRET>`;
2. rejects missing/invalid secret;
3. calls maintenance application use cases;
4. returns only aggregate operational counts;
5. never logs PII.

The route contains no business logic.

Maintenance performs:

- due confirmation retries;
- exhausted-confirmation transition;
- pre-launch unsubscribe anonymization;
- post-launch-send anonymization.

---

# 11. Confirmation retry policy

Maximum total confirmation attempts:

```text
3
```

Attempt 1:

- immediately after successful signup/resubscribe.

If the provider returns a **known retryable failure**:

- set `confirmation_status=failed`;
- set `confirmation_next_attempt_at` for the next daily maintenance opportunity.

Attempt 2:

- next eligible daily maintenance run.

Attempt 3:

- following eligible daily maintenance run.

After third known failure:

```text
confirmation_status=exhausted
```

Subscriber remains active and launch-eligible.

If provider outcome is **ambiguous** (request may have been accepted but response is unknown), stop automatic retries rather than risk duplicate confirmation mail; represent this as exhausted/non-retryable operational state and log only an internal error code + signup UUID.

---

# 12. Launch-send reliability

The one-time launch send is human-gated GitHub Actions.

## 12.1 Required dry run

Real sending requires a preceding dry-run execution for the same exact release inputs/version.

Dry run:

- validates production release stage;
- validates HTTPS download destination;
- calculates eligible recipient count;
- renders final HTML/text email;
- sends only to configured maintainer/test recipient;
- does not mutate subscriber launch state;
- produces no PII in logs.

## 12.2 Production send

Protected:

- `workflow_dispatch`;
- dedicated `launch-production` GitHub Environment;
- required reviewer where GitHub Free permits;
- environment-scoped secrets;
- single-run concurrency.

## 12.3 Per-recipient state

Before provider call:

```text
launch_status=sending
launch_attempt_count += 1
launch_last_attempt_at=now
```

Use deterministic Resend idempotency key:

```text
corpus-launch-v1/<signup-id>
```

Known provider failure:

```text
launch_status=failed
```

Provider accepted:

```text
launch_status=sent
launch_sent_at=now
```

Ambiguous provider outcome:

- keep `sending`;
- rerun with same idempotency key while provider idempotency window remains valid.

If still ambiguous after the provider idempotency window:

```text
launch_status=manual_review
```

Never automatically resend after that point.

Priority:

> Never send the launch notification twice, even if that means one ambiguous recipient requires manual review.

---

# 13. Architecture

Use current Claude Stack `next-app` standard.

Core rules:

- `core` declares ports;
- `adapters` implement them;
- `core` never imports `adapters`;
- dependencies injected;
- one use case per file;
- classes for use cases/adapters;
- arrow functions for free functions;
- ports: `<capability>.port.ts`;
- technology-prefixed adapters;
- kebab-case source filenames;
- adapter construction only under composition capabilities;
- use-case construction only in feature wiring.

## 13.1 Feature boundary

`early-access` gets a bounded backend port.

Conceptual path:

```text
Server Action
  → composition/server/early-access
  → EarlyAccessBackend
  → LocalEarlyAccessBackend
  → use cases
  → repository / ports
  ← adapters
```

No public REST API for signup.

No speculative HTTP backend.
No `BACKEND_MODE` in v1.

## 13.2 Web vs operations composition

Separate:

```text
composition/server/
composition/ops/
```

They share:

- core;
- use cases;
- adapters.

They differ only in wiring/lifetime.

GitHub Actions operational commands use `composition/ops`.

Vercel Cron is a server entrypoint and calls the same maintenance use cases through an appropriately bounded server composition entry.

## 13.3 Server runtime

Node.js runtime only.

No Edge-runtime implementation in v1.

---

# 14. Suggested source shape

The current Claude Stack scaffold is authoritative if exact generated paths differ.

Conceptually:

```text
src/
├── app/
│   ├── page.tsx
│   ├── privacy/page.tsx
│   ├── terms/page.tsx
│   ├── early-access/manage/page.tsx
│   ├── api/cron/maintenance/route.ts
│   ├── robots.ts
│   ├── sitemap.ts
│   └── opengraph-image.tsx
│
├── features/
│   ├── landing/
│   │   ├── content/
│   │   ├── motion/
│   │   ├── ui/
│   │   └── landing.css
│   └── early-access/
│       ├── actions/
│       ├── backend/
│       │   ├── early-access-backend.ts
│       │   └── local-early-access-backend.ts
│       ├── schemas/
│       ├── ui/
│       ├── early-access.wiring.ts
│       └── early-access.css
│
├── core/
│   ├── entities/
│   ├── errors/
│   ├── mappers/
│   ├── ports/
│   ├── repositories/
│   ├── results/
│   ├── use-cases/
│   └── testing/
│
├── adapters/
│   ├── captcha/
│   ├── db/
│   ├── email/
│   │   └── templates/
│   └── logging/
│
├── composition/
│   ├── capabilities/
│   ├── server/
│   └── ops/
│
├── ops/
├── components/
├── config/
└── lib/
```

---

# 15. Required use cases

One class/file each:

```text
join-early-access.use-case.ts
unsubscribe-early-access.use-case.ts
resubscribe-early-access.use-case.ts
send-confirmation-email.use-case.ts
retry-failed-confirmations.use-case.ts
send-launch-email.use-case.ts
purge-expired-signup-pii.use-case.ts
```

---

# 16. Styling

CSS-first.

Use:

- CSS custom properties;
- feature/component CSS;
- semantic class names.

Do not translate the page into Tailwind utility markup.

If `new-project` installs Tailwind by default, remove it unless current stack conformance explicitly requires it.

Fonts:

```text
Newsreader
Karla
```

Load with `next/font/google`.

No runtime Google Fonts request.

---

# 17. Rendering and motion

Homepage:

- Server Components/static rendering by default.
- Hydrate only bounded interactive islands.

Client islands:

- hero GSAP controller;
- scrollytelling controller;
- Living Lexicon browser;
- cloze interaction;
- signup/CAPTCHA bridge;
- management-token fragment bridge;
- shared magnetic/parallax behavior where required.

GSAP:

- normal dependency;
- no CDN scripts;
- no second animation framework.

Static content:

- landing copy;
- demo lexicon;
- legal copy;
- structural content.

No database/CMS for marketing demo content.

---

# 18. Demo content

Typed static content in repo.

No runtime Neon read.

Preserve current demo vocabulary and encounter-story intent from the approved mockup.

Codex does not rewrite product copy.

---

# 19. Accessibility

Release target:

```text
WCAG 2.2 AA
```

Required:

- semantic headings/landmarks;
- skip link;
- keyboard-only operation;
- visible focus;
- sufficient contrast;
- accessible forms/status messages;
- no essential motion-dependent meaning;
- `prefers-reduced-motion`;
- Living Lexicon keyboard controls;
- pause/control semantics for auto-moving content;
- screen-reader-correct state updates;
- email HTML with meaningful reading order;
- plain-text email alternatives.

Use `@axe-core/playwright` for automated accessibility assertions on key surfaces.

---

# 20. Browser support

- latest 2 major Chrome desktop;
- latest 2 Edge desktop;
- latest 2 Firefox desktop;
- latest 2 Safari desktop;
- current Chrome Android;
- current Safari iOS.

No IE.
No legacy polyfill burden.

---

# 21. SEO

Production:

```text
index, follow
```

Preview/local/test:

```text
noindex, nofollow
```

Preview robots blocks crawling.

Ship:

- canonical metadata;
- sitemap;
- robots;
- Open Graph metadata;
- Twitter metadata;
- favicon/app icons;
- dedicated social preview.

Canonical origin:

```text
SITE_URL
```

Never infer trusted canonical/manage links from incoming proxy headers.

## 21.1 Social preview

Generate deterministic social card.

1200×630.

Design:

- paper background;
- canonical Corpus geometric mark;
- restrained vertical axis/diamond motif;
- `Corpus`;
- `Learn words from real life.`;
- ink + clay palette;
- no product screenshot;
- no stock imagery;
- no AI-generated decorative artwork.

---

# 22. Security headers

Production baseline:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
```

CSP intent:

```text
default-src 'self'
base-uri 'self'
object-src 'none'
frame-ancestors 'none'
form-action 'self'
font-src 'self'
img-src 'self' data:
style-src 'self' 'unsafe-inline'
script-src 'self' 'unsafe-inline' <required reCAPTCHA origins only>
frame-src <required reCAPTCHA origins only>
connect-src 'self' <required reCAPTCHA origins only>
upgrade-insecure-requests
```

Do not use request nonces in v1 because that would force dynamic rendering of the static-first landing.

Do not add wildcard third-party origins.

Development may relax CSP only as required by Next.js dev tooling.

---

# 23. Error strategy

Suggested typed taxonomy:

```text
SignupClosedError
CaptchaRejectedError
InvalidManagementTokenError
SignupAnonymizedError
ConfirmationDeliveryError
LaunchDeliveryError
PersistenceConflictError
```

Boundary validation errors remain Zod errors.

Public signup mapping:

- invalid syntax → explicit invalid-email copy;
- CAPTCHA rejection → generic retry;
- persistence/internal error → generic retry;
- duplicate/new distinction → same success;
- launched/closed → signup closed state.

Manage mapping:

- invalid token → `This management link is no longer valid.`
- anonymized token → same invalid-link state;
- already unsubscribed → normal already-unsubscribed page;
- internal errors → generic retry/failure.

Never echo provider/database errors to browser.

---

# 24. Logging

Use Pino.

Loggable:

- signup UUID;
- operation name;
- lifecycle state;
- error code;
- delivery state;
- attempt count;
- aggregate counts;
- durations.

Never log:

- email;
- normalized email;
- raw management token;
- token hash;
- CAPTCHA token;
- CAPTCHA score;
- Resend response body;
- DB connection string;
- secrets;
- full request form data.

No Sentry in v1.

---

# 25. Analytics

Use only:

- Vercel Web Analytics;
- Vercel Speed Insights.

No:

- custom conversion tracking;
- ad pixels;
- session replay;
- behavioral analytics;
- email open tracking;
- email click tracking.

---

# 26. Legal pages

Ship:

```text
/privacy
/terms
```

Privacy must accurately document actual collection, processors, retention, analytics, unsubscribe/resubscribe, anonymization, and no sale/marketing use.

Terms must stay concise and product-specific: pre-release status, no release-date guarantee, changing features/availability, early-build defects, platform/distribution constraints, abuse prohibition, and contact/legal details.

---

# 27. CI

Stable required job/check names:

```text
check
test
preview
e2e
lighthouse
```

## `check`

- frozen Bun install
- typecheck
- Biome
- dependency-cruiser
- Claude Stack conformance

## `test`

- disposable Neon CI branch
- migrate
- Vitest
- repository contracts
- email render tests
- domain/use-case tests
- cleanup branch

## `preview`

- `pr-<number>` branch from `development`
- migrate
- Vercel Preview
- real email when Preview email configuration is present
- fake CAPTCHA
- noindex
- output preview URL
- cleanup on close

## `e2e`

Playwright against preview.

## `lighthouse`

Lighthouse CI against preview.

---

# 28. Playwright acceptance matrix

Full critical suite in Chromium.

Cross-browser smoke/critical interaction in Firefox and WebKit.

Mobile coverage via mobile Chrome and mobile Safari emulation.

Required scenarios:

- homepage render;
- hero;
- anchors;
- sticky header;
- progress spine;
- scrollytelling;
- Living Lexicon click/keyboard/drag;
- autoplay pause/control;
- cloze;
- philosophy theme inversion;
- mobile layout;
- reduced motion;
- valid signup;
- invalid email;
- CAPTCHA rejection;
- generic internal failure;
- duplicate signup;
- resubscribe;
- confirmation failure does not invalidate signup;
- launched mode hides/rejects signup;
- valid management fragment;
- fragment removed from visible URL;
- masked email;
- explicit unsubscribe;
- already unsubscribed;
- invalid token;
- invalidated/anonymized token;
- privacy;
- terms;
- preview noindex;
- preview robots;
- no real email in preview;
- no real CAPTCHA in preview.

---

# 29. Automated accessibility checks

Run axe on:

- homepage;
- Manage Early Access active;
- Manage Early Access unsubscribed;
- Privacy;
- Terms.

Automated a11y is a regression gate, not a claim of complete WCAG verification.

---

# 30. Lighthouse CI

Homepage preview.

Mobile.

3 runs.

Median hard thresholds:

```text
Performance     >= 0.90
Accessibility   >= 0.95
Best Practices  >= 0.95
SEO             >= 0.95
```

No self-hosted LHCI server.
No paid Lighthouse service.

---

# 31. Git model

Public:

```text
GonzaOrtega/corpus-landing
```

MIT.

Only long-lived branch:

```text
main
```

All changes via PR.

Squash merge only.

Maximum practical GitHub Free public-repo protection:

- PR required;
- required checks;
- current with base;
- conversations resolved;
- no force-push;
- no deletion;
- bypass disabled where supported.

Required:

```text
check
test
preview
e2e
lighthouse
```

---

# 32. Production deployment

Merge to `main` does not automatically alter production.

Production release uses explicit `workflow_dispatch` for the exact main SHA.

Sequence:

1. verify requested/event/live main SHA;
2. install;
3. production Drizzle migration using unpooled URL;
4. stage Vercel production deployment without domain;
5. smoke test;
6. re-verify main SHA;
7. zero-rebuild promote.

Production concurrency protected.

Rollback via previous known-good Vercel deployment.

Migrations follow expand → deploy → contract discipline.

---

# 33. Preview/CI database automation

Use official Neon GitHub Actions.

PR:

```text
pr-<number>
```

Parent:

```text
development
```

CI:

```text
ci-<run-id>-<attempt>
```

Parent:

```text
development
```

Always cleanup temporary branches.

Production never used by previews/CI.

---

# 34. Runtime environments

## Production

Real:

- Neon main;
- Resend;
- Google reCAPTCHA;
- Vercel Analytics/Speed Insights;
- Vercel Cron.

## Preview

Real:

- isolated Neon preview branch;
- email, when Preview email configuration is present, sent from its own
  sender domain.

Fake/no-op:

- CAPTCHA.

Noindex.

## CI

Real:

- isolated Neon branch.

Fake/no-op:

- email;
- CAPTCHA.

CI never sends, whatever credentials the checkout happens to carry. The E2E
runtime bind-mounts the repository, so this is enforced by explicit pipeline
signal rather than by absent configuration.

## Local

Stable Neon `development` when DB integration needed.

Real email when local email configuration is present, sent from its own
sender domain; fake/no-op otherwise.

Fake/no-op CAPTCHA.

---

# 35. Configuration contract

Expected semantics:

```text
SITE_URL

CORPUS_RELEASE_STAGE
CORPUS_DOWNLOAD_URL

DATABASE_URL
DATABASE_URL_UNPOOLED
DATABASE_URL_TEST

RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY
RECAPTCHA_SCORE_THRESHOLD

RESEND_API_KEY
EMAIL_FROM
REPLY_TO
EMAIL_POSTAL_ADDRESS

CRON_SECRET

LAUNCH_DRY_RUN_RECIPIENT
```

Automation may additionally require Vercel/Neon IDs/tokens.

Real values never committed.

`.env.example` contains names + safe descriptions only.

---

# 36. Dependency policy

Use current Claude Stack-pinned/recommended versions at implementation time.

Intentional runtime categories:

- Next.js / React;
- Drizzle;
- Neon driver;
- Zod;
- GSAP;
- Resend;
- React Email;
- Pino;
- Vercel Analytics;
- Vercel Speed Insights.

Intentional dev categories:

- Vitest;
- Playwright;
- `@axe-core/playwright`;
- Lighthouse CI;
- Biome;
- dependency-cruiser;
- Drizzle Kit;
- Claude Stack conformance.

No:

- Tailwind unless required by current conformance;
- second animation library;
- Upstash;
- CMS;
- Sentry;
- campaign library;
- email validation SaaS.

Commit `bun.lock`.

CI/deploy uses `bun install --frozen-lockfile`.

GitHub Actions are SHA-pinned per Claude Stack production standards.

---

# 37. Public-repository security posture

Assume all code, architecture, schema, migrations, YAML, and runbooks are public.

Never commit subscriber data, credentials, connection strings, raw tokens, private addresses, or secret-bearing fixtures.

Security does not rely on obscurity.

---

# 38. Codex decision boundary

Codex may choose only non-product implementation mechanics consistent with Claude Stack.

Codex may not redesign, rewrite copy, add subsystems, change persistence/email/privacy semantics, introduce a public signup API, introduce `BACKEND_MODE`, add tracking, log PII, share the main Corpus DB, weaken deployment/environment gates, or automatically resend ambiguous launch mail after the idempotency window.

---

# 39. Definition of done

Done requires:

1. stack conformance green;
2. typecheck green;
3. Biome green;
4. dependency rules green;
5. Vitest green;
6. repository integration green on disposable Neon;
7. Playwright green;
8. axe green;
9. Lighthouse green;
10. preview isolation proven;
11. no real preview email/CAPTCHA;
12. idempotent production signup;
13. confirmation retry policy proven;
14. secure manage flow;
15. unsubscribe/resubscribe proven;
16. launch dry run proven;
17. launch idempotency/manual-review semantics proven;
18. daily maintenance proven;
19. launched-mode transition proven;
20. legal copy matches behavior;
21. production indexable / previews noindex;
22. security headers present;
23. no PII in logs/artifacts;
24. public docs safe;
25. stage/smoke/promote deployment proven;
26. rollback documented.

---

# 40. Deployment-time values intentionally unresolved

Not design blockers:

- final domain;
- actual sending subdomain;
- actual `EMAIL_FROM`;
- actual `REPLY_TO`;
- actual postal address;
- real Neon project IDs;
- real reCAPTCHA credentials;
- Vercel project IDs/tokens;
- real launch download URL.

Codex implements validated configuration contracts without needing these values during initial build.

---

# 41. Final Codex instruction

> Build this specification. Treat the supplied landing HTML and email HTML files as visual source material, the main Corpus repository as canonical brand source, and the current Claude Stack `next-app` blueprint/production standards as architecture authority. Do not reinterpret product behavior or design. Preserve observable behavior and accessibility when translating the HTML prototype to React/Next.js. Keep the public repository safe by construction: no secrets or PII in source, logs, fixtures, docs, workflows, or test artifacts. Complete only when all automated gates and manual visual QA pass.
