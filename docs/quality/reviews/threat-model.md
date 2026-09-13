# Threat model

Written once per repo at review-gate intake, from the product brief. Edit freely; the classifying
agent reads the two lists below when it decides whether a finding applies to this product.

## In model

- Public, unauthenticated visitors can submit early-access signups and use opaque management links.
- Automated or abusive public traffic can consume reCAPTCHA assessments, Vercel invocations, and database capacity.
- Production Server Actions handle personal data and management tokens, so their request paths and response behavior are security-sensitive.
- Pull requests deploy Vercel Previews and required GitHub checks gate merges to the public production site.
- The repository must not expose credentials, database URLs, raw management tokens, subscriber data, or provider response bodies.

## Out of model

- User accounts, passwords, and session-based authorization do not exist; management links are the product's deliberate access mechanism.
- Fork pull requests do not receive Vercel or Neon deployment credentials; deployment-dependent checks fail closed.
- Preview and local environments do not use production reCAPTCHA credentials or production email configuration.
- The maintenance endpoint is not public: it requires its configured bearer credential.
