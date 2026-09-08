# Launch-email operations

The launch notification is a one-time, human-gated operation. The safe order is:

```text
dry run → fingerprint/count/render review → protected production send → manual review
```

Never skip the dry run, alter launch state to force eligibility, invent a new
idempotency key, or automatically resend a `manual_review` row.

## Preconditions

Before any launch operation:

1. Deploy and verify the `launched` release stage by following
   [production-deploy.md](production-deploy.md). The download destination must
   use HTTPS.
2. Confirm `main` is the exact reviewed commit and all required checks passed.
3. Configure the dedicated GitHub `launch-production` Environment with a
   required reviewer where the account supports it, no unreviewed bypass,
   environment-scoped secrets, and deployment restricted to `main`.
4. Configure the environment names consumed by
   `.github/workflows/launch-email.yml`: `SITE_URL`, `CORPUS_DOWNLOAD_URL`,
   `EMAIL_FROM`, `REPLY_TO`, `EMAIL_POSTAL_ADDRESS`, `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, `RESEND_API_KEY`, `LAUNCH_DRY_RUN_RECIPIENT`, and
   `MANAGEMENT_TOKEN_SECRET`. Values stay in protected settings and must never
   be pasted into GitHub inputs or logs.
5. Review the committed typed release JSON. It contains only the release
   version, summary, included features, honest limitations, and HTTPS download
   URL. It must not contain arbitrary HTML, credentials, subscriber data, or
   tracking parameters. `ops/release-input.example.json` documents the shape.
6. Ensure no other launch run is active. The workflow uses one non-canceling
   concurrency group so an in-flight send is never canceled by a newer run.

## 1. Perform the dry run

Use an approved operator environment with production launch configuration and
the reviewed committed release file. Keep the review output outside the
repository and out of shared terminal capture:

```bash
review_dir="$(mktemp -d)"
bun run ops:launch-dry-run -- --release-file ops/release-input.json > "$review_dir/result.json"
jq '{fingerprint, eligibleCount, subject}' "$review_dir/result.json"
jq -r '.html' "$review_dir/result.json" > "$review_dir/launch.html"
jq -r '.text' "$review_dir/result.json" > "$review_dir/launch.txt"
```

The command validates the launched stage and release input, renders the final
HTML and text, counts eligible recipients, and sends only to the configured
dry-run recipient. It does not mutate subscriber launch state. Protect the
temporary directory as operational material and remove it after the release;
never add it to Git or an artifact.

Also dispatch **Launch email** from `main` with the same committed
`release_file` and `send_production` disabled. Approve only the dry-run job. It
uses the protected environment and proves the committed payload can execute in
the GitHub runner. It sends only to `LAUNCH_DRY_RUN_RECIPIENT` and does not
start the production job.

## 2. Review fingerprint, count, and render

Before enabling production sending, record the following in the private
release record:

- exact `main` commit and release-file path;
- dry-run fingerprint;
- eligible recipient count and review time;
- confirmation that subject, HTML, plain text, feature list, limitations,
  download link, management link, sender identity, reply address, and postal
  address rendered correctly;
- confirmation that the dry-run message reached only the approved recipient;
- reviewer identity and approval decision.

The fingerprint is a SHA-256 digest of the validated release payload. Any
change to the release version or content changes it. If the file, commit,
render, destination, or eligible count changes unexpectedly, stop and repeat
the dry run and review; never reuse an earlier approval.

Do not publish the rendered mail or eligible count as a workflow artifact.
Neither the command nor the release record may contain subscriber addresses,
raw management tokens, provider response bodies, database URLs, or secrets.

## 3. Run the protected production send

1. Dispatch **Launch email** again from the reviewed `main` commit with the
   same committed `release_file` and `send_production` enabled.
2. The workflow first repeats the protected dry run. Its fingerprint is passed
   directly to the dependent production job; production rejects a payload
   whose calculated fingerprint does not match.
3. Review the commit, release file, successful dry run, test delivery, and
   release record at the `launch-production` Environment approval gate. Do not
   approve if the expected gate or reviewer protection is absent.
4. Approve the production job once. Let it finish under the single-run
   concurrency guard. Do not start a parallel CLI send.
5. Record the workflow run, commit, release fingerprint, processed/skipped
   aggregate counts, and completion state in the private release record.

The production operation reads eligible rows in stable UUID batches. Before a
provider call it records `sending`, increments the attempt counter, and stores
the attempt time. A provider acceptance records `sent` and `launch_sent_at`; a
known failure records `failed`. Logs contain only operation names, signup UUIDs,
states, aggregate counts, and timings—never addresses, tokens, or provider
response bodies.

## Idempotent reruns

Every recipient uses the deterministic provider idempotency key
`corpus-launch-v1/<signup-id>`. A rerun skips rows already marked `sent` or
`manual_review`. A known failed delivery may be retried through the same
reviewed workflow and same release payload; the deterministic key remains the
same.

When the provider result is ambiguous, the row stays `sending`. During the
provider's 24-hour idempotency window, a reviewed rerun uses the same key so a
possibly accepted message is not duplicated. Do not change the signup UUID,
status, last-attempt time, or idempotency key to make a rerun happen.

## Manual-review handling

If ambiguity remains once the 24-hour idempotency window has expired, the next
operation moves the row to `manual_review` without calling the provider. From
that point:

1. Stop automatic action for that UUID. Subsequent launch runs intentionally
   skip it.
2. Investigate through approved private provider and database tooling using
   only UUID, delivery state, timestamps, and provider-side evidence. Keep PII
   and provider response bodies out of tickets, chat, logs, and repository
   files.
3. If acceptance can be established, leave the row protected from resend and
   record the conclusion privately.
4. If non-delivery can be established, escalate for a separately reviewed
   remediation. The current operation has no supported automatic or database
   state bypass. Never change `manual_review` to `pending`/`failed`, generate a
   different key, or send directly from the provider dashboard.

The governing priority is to avoid sending a launch notification twice, even
when that means one recipient requires manual handling.

## Abort conditions

Stop without sending when the release stage or HTTPS destination is invalid,
the committed payload differs from the reviewed payload, the fingerprint does
not match, the count or render is unexplained, reviewer protection is absent,
another run is active, or credentials/resources are not the intended
Production ones. Correct the condition, then restart at the dry run.
