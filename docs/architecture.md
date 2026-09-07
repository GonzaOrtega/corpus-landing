# Architecture

Corpus Landing is a Next.js App Router application with a hexagonal backend.
The public web experience, scheduled maintenance, and human-gated launch send
reuse the same domain behavior while keeping their entry points and credentials
separate.

## Dependency rule

The source dependency direction is:

```text
core ← adapters ← composition
```

- `src/core/` owns entities, errors, port and repository contracts, and use
  cases. It has no Next.js, Drizzle, Neon, Resend, or Google dependency.
- `src/adapters/` implements core contracts for persistence, email, CAPTCHA,
  security, and logging.
- `src/composition/capabilities/` constructs concrete adapters.
- `src/composition/server/` and `src/composition/ops/` expose dependency slices
  for different entry points.
- `src/features/` connects UI and Server Actions to composed use cases.
- `app/` owns routes, layouts, metadata, and the maintenance HTTP boundary.

```mermaid
flowchart LR
  subgraph EntryPoints[Entry points]
    Browser[Browser UI]
    Cron[Vercel Cron]
    Operator[Protected GitHub Actions]
  end

  subgraph Composition[Composition roots]
    WebRoot[Web and maintenance composition]
    OpsRoot[Launch operations composition]
  end

  subgraph Adapters[Adapters]
    DbAdapter[Drizzle and Neon]
    EmailAdapter[Fake email or Resend]
    CaptchaAdapter[Fake CAPTCHA or Google reCAPTCHA]
    SecurityAdapter[Token hashing and derivation]
    LoggerAdapter[Pino logger]
  end

  subgraph Core[Core]
    UseCases[Early-access use cases]
    Ports[Ports and repository contracts]
    Entity[EarlyAccessSignup]
  end

  Browser -->|Server Actions| WebRoot
  Cron -->|Authorized maintenance GET| WebRoot
  Operator -->|Launch CLI| OpsRoot
  WebRoot --> DbAdapter
  WebRoot --> EmailAdapter
  WebRoot --> CaptchaAdapter
  WebRoot --> SecurityAdapter
  OpsRoot --> DbAdapter
  OpsRoot --> EmailAdapter
  OpsRoot --> SecurityAdapter
  OpsRoot --> LoggerAdapter
  DbAdapter --> Ports
  EmailAdapter --> Ports
  CaptchaAdapter --> Ports
  SecurityAdapter --> Ports
  LoggerAdapter --> Ports
  Ports --> UseCases
  UseCases --> Entity
```

Arrows show runtime calls toward the abstractions depended on. Imports follow
the same inward direction: composition may import adapters and core; adapters
may import core contracts; core never imports adapters or composition.

## Composition roots

### Web and scheduled maintenance

`src/composition/root.ts` loads validated server configuration and provides
persistence, notification, CAPTCHA, logging, and token capabilities.
`src/composition/server/early-access.ts` narrows that context for signup,
confirmation, and management. `src/composition/server/maintenance.wiring.ts` builds
the daily retry and anonymization operation from those same core use cases.

In non-production environments, capability providers select deterministic,
non-network fake email and CAPTCHA adapters. In Production they fail closed
unless the real provider configuration is present. Database persistence is
real in every deployed environment; CI and Preview isolate it with disposable
Neon branches.

### Launch operations

`src/composition/ops/launch.wiring.ts` is separate from the web composition root. It
explicitly requests real email delivery, constructs the launch-only stable
management-token derivation, and exposes dry-run and production operations to
`scripts/launch-email.ts`. The public web request path cannot invoke this root.

The split matters because launch is a one-time, human-gated operation with a
different credential set and stricter idempotency requirements than ordinary
web requests.

## Public request paths

```mermaid
sequenceDiagram
  participant B as Browser
  participant SA as Next.js Server Action
  participant W as Web composition
  participant C as Core use case
  participant A as Adapters

  B->>SA: Submit signup form
  SA->>W: Resolve dependency slice
  W->>C: Join or resubscribe
  C->>A: Verify CAPTCHA, persist, send confirmation
  A-->>C: Technology-neutral outcome
  C-->>SA: Result state
  SA-->>B: Generic user-facing response

  B->>SA: Resolve fragment token or explicitly unsubscribe
  SA->>W: Resolve management use cases
  W->>C: Read state or revoke consent
  C->>A: Hash token and query or update row
  A-->>C: Domain entity
  C-->>SA: Masked state
  SA-->>B: No full email or raw token
```

Signup, management resolution, and unsubscribe are Server Actions. There is
**no public signup REST API**. Management credentials arrive in an email URL
fragment, are removed from the visible browser URL, and are then submitted to
Server Actions; raw tokens never enter a path or query string.

The sole application API route is `GET /api/cron/maintenance`. It verifies a
bearer secret in constant time, calls the composed maintenance operation, and
returns only aggregate counts. The route contains no business logic.

## Data and lifecycle

The core models one `EarlyAccessSignup`. Drizzle maps it to the
`early_access_signups` table without exposing database rows to the core. A
partial unique index prevents multiple identifiable current rows for one
normalized email while allowing anonymized history.

Confirmation delivery uses bounded retry state. Launch delivery records
`pending`, `sending`, `sent`, `failed`, or `manual_review`; a deterministic
provider idempotency key protects reruns. Retention clears email and the
management-token hash after the applicable 30-day boundary while keeping
non-identifying consent and delivery evidence. The exact procedures are in
[Launch email](operations/launch-email.md) and
[Privacy and retention](operations/privacy-retention.md).

## Deployment boundaries

Pull requests use disposable Neon branches and Vercel Preview deployments with
fake email/CAPTCHA and noindex metadata. Production uses an explicit
stage/smoke/promote workflow for an exact `main` SHA; merging alone never
deploys. Rollback moves traffic to a recorded known-good Vercel Production
deployment and leaves backward-compatible expanded migrations in place.

The authoritative operator procedures are
[Preview CI](operations/preview-ci.md),
[Production deployment](operations/production-deploy.md), and
[Rollback](operations/rollback.md).
