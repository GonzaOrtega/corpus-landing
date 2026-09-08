# Privacy and retention operations

This runbook implements the early-access retention contract in design spec §10.
Its purpose is irreversible anonymization of subscriber identity after the
applicable 30-day boundary while preserving non-identifying consent and
delivery evidence.

## Retention rules

### Successful launch recipient

When `launch_sent_at` is at least 30 days old, anonymize the row. The retention
clock starts from successful launch delivery, not signup, confirmation, launch
attempt, or release date.

### Pre-launch unsubscribe

When `unsubscribed_at` is at least 30 days old and the person has not
resubscribed, anonymize the row even if Corpus has not launched. Resubscription
rotates the management token, refreshes consent, and clears `unsubscribed_at`,
so the old unsubscribe boundary is no longer due.

The maintenance query ignores rows already anonymized. A row meeting either
boundary is processed once.

## Exact anonymization

For every due row, maintenance performs all of the following atomically through
the repository save operation:

- set `email_original` to `null`;
- set `email_normalized` to `null`;
- set `manage_token_hash` to `null`;
- set `anonymized_at` to the maintenance time;
- update `updated_at` to the maintenance time.

Do not retain or create an email hash. After these fields are cleared, the
management credential is invalid and the partial unique index no longer treats
the historical row as the current record for that address.

The row may preserve only non-identifying lifecycle evidence, including:

- the internal UUID;
- `consent_version` and `consented_at`;
- `created_at`, the updated `updated_at`, `unsubscribed_at`, and
  `anonymized_at`;
- confirmation status, attempt count, last/next-attempt timestamps, and sent
  timestamp;
- launch status, attempt count, last-attempt timestamp, and `launch_sent_at`.

Consent version/timestamps and non-identifying delivery status/timestamps are
therefore retained; the original and normalized email and management-token
hash are not.

## Daily authorized maintenance

Vercel Cron invokes `GET /api/cron/maintenance` once daily according to
`vercel.json`. The Production route is protected by
`Authorization: Bearer <CRON_SECRET>` and compares the credential without
logging it. Missing or invalid authorization returns `401 Unauthorized` before
any retry or anonymization work runs.

The route contains no business logic. After authorization it calls the server
maintenance composition, which processes bounded batches of:

1. due confirmation retries;
2. exhausted-confirmation transitions;
3. pre-launch unsubscribe anonymization;
4. post-launch-send anonymization.

Its response and completion log contain aggregate counts only:
`confirmationRetriesProcessed`, `confirmationExhausted`,
`unsubscribedAnonymized`, and `launchedAnonymized`. They must never include an
email, raw token or hash, CAPTCHA data, provider response, or database URL.

## Operator procedure

1. Verify the Production Vercel project has a `CRON_SECRET` in its protected
   environment and the daily cron in `vercel.json` is active. Never place the
   value in a repository variable, command line, ticket, screenshot, or log.
2. Check the scheduled invocation result daily through approved Vercel
   operational access. A success response contains only aggregate counts.
3. Treat `401` as a configuration or scheduler-authentication failure; confirm
   the protected secret binding and retry only through an authorized mechanism.
4. Treat a server error as a failed maintenance run. Inspect sanitized error
   codes and infrastructure health without enabling raw database/provider
   output, then restore service and run the same authorized maintenance path.
5. If more than one batch is due, allow subsequent authorized runs to continue
   bounded processing. Do not bypass the use case with ad hoc SQL.
6. Record run time, status, and aggregate counts in the private operational
   record. Do not record row exports or recipient identifiers.

For a manual recovery run, use an approved secret-injection mechanism and an
HTTP client that does not echo or persist authorization headers. Call the same
Production route; do not add a second route, place the bearer value directly in
shell history, or invoke repository mutations manually.

## Verification and incident handling

Periodically verify through an aggregate-only or access-controlled audit that:

- no identifiable row remains beyond 30 days after `launch_sent_at`;
- no non-resubscribed identifiable row remains beyond 30 days after
  `unsubscribed_at`;
- anonymized rows have all three identifying fields cleared and
  `anonymized_at` set;
- consent evidence and non-identifying delivery state remain available;
- application logs and artifacts contain no PII.

Never export subscriber rows to perform this check. If a due row remains
identifiable, restrict access, preserve sanitized timing/error evidence, restore
the authorized maintenance path, and run it. If PII or a credential appears in
Git, logs, or an artifact, treat it as a security incident: remove access,
rotate affected credentials, and follow [SECURITY.md](../../SECURITY.md).
