# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Use GitHub's private vulnerability reporting: the **Security** tab →
**Report a vulnerability**. This opens a private advisory visible only to the
maintainers.

You can expect an acknowledgement within 7 days.

## Security posture

This repository is built to be safe as a public artifact. Per the design
specification (§37), we assume **all code, architecture, schema, migrations,
workflow YAML, and runbooks are public** and design accordingly. Security never
relies on obscurity.

The following are never committed, in any branch, at any point in history:

- subscriber email addresses or any personal data
- database connection strings (pooled or unpooled)
- API credentials (`RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, `CRON_SECRET`, …)
- raw management or unsubscribe tokens, or token-shaped test fixtures
- Vercel or Neon project identifiers, tokens, or deploy hooks

Configuration is contract-only: `.env.example` carries variable **names** and
safe descriptions, never values. See the configuration contract in
`docs/superpowers/specs/2026-09-06-corpus-landing-design.md` (§35).

## Automated enforcement

A [gitleaks](https://github.com/gitleaks/gitleaks) scan runs on every push and
pull request against the **full commit history**, not just the diff. Because
this repository is private today and public later, a secret introduced now
would still be exposed at the moment visibility flips — history is not rewritten
by changing visibility. The full-history scan is what makes that flip safe.

If the scan ever fails, treat the credential as compromised and **rotate it**.
Removing the commit is not sufficient remediation on its own.

## Handling of personal data

The service stores early-access email addresses. Retention, anonymization, and
deletion semantics are specified in §10 of the design specification and will be
documented for operators in `docs/operations/privacy-retention.md`.
