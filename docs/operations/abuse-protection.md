# Production abuse protection

## Early-access Server Action rate limit

Production uses the Vercel Firewall rule `early-access-server-actions` to stop
excess traffic before it can invoke reCAPTCHA, the database, or a Server Action.
It is configured in the Vercel project dashboard because repository
configuration supports deny/challenge rules but not rate-limit actions.

| Setting | Value |
| --- | --- |
| Production host | `trycorpus.app` |
| Methods | `POST` |
| Paths | `/`, `/early-access/manage`, `/monitoring` |
| Counter key | IP |
| Algorithm | Fixed window |
| Limit | 60 requests per 60 seconds per region |
| Initial follow-up | Log for seven days |
| Enforcement follow-up | Default `429` response after the observation period |

The first two paths cover signup, management-token resolution, and unsubscribe;
`/monitoring` is the Sentry envelope tunnel described in
`docs/operations/sentry.md`. None of them covers the GET-only maintenance route
or Preview deployments. The limit is per region, so it constrains ordinary abuse
and cost rather than acting as a globally absolute cap.

### Why one rule carries both concerns

Hobby allows one rate-limit rule per project, so signup and the Sentry tunnel
share a limit even though their healthy traffic differs in shape: one signup per
visitor, against a burst of envelopes from every open tab after a bad deploy.
Sizing for signup alone would discard error reports exactly when they are worth
having, so the shared limit is set for the tunnel at 60 rather than for signup
at 10.

That is a deliberate six-fold loosening of the signup limit, acceptable because
reCAPTCHA and its score threshold are the primary signup defence and this rule
is cost protection behind them — and because the rule is still in `Log` mode,
where nothing is blocked and the limit only decides what gets recorded. Choose
the enforcement limit from the observation window, not from this estimate.

The rule is not readable through the REST API: `GET` on the project's firewall
config answers `404 Seawall Config not found` regardless of `configVersion`.
Read and edit it in the dashboard.

## Current observation

The log-only rule was published on 2026-09-13 UTC. Eleven empty POST requests
to `/early-access/manage` each returned `405 Method Not Allowed`, proving that
they did not invoke a Server Action. Firewall overview recorded the resulting
threshold crossing as one log event for `early-access-server-actions`.

On 2026-09-22 UTC `/monitoring` joined the same rule and the limit rose to 60,
when #19 put the Sentry tunnel into production. The seven-day observation window
restarts from that date: the traffic mix the earlier window measured no longer
matches what the rule now covers.

## Rollout and verification

1. Publish the rule with the `Log` follow-up action.
2. Send eleven harmless POST requests to `/early-access/manage`; confirm the
   Firewall records the matched requests and that no signup or management data
   changes.
3. Observe production traffic for seven days. Investigate any legitimate
   shared-IP traffic that reaches the threshold.
4. Change the follow-up action to the default `429` response and repeat the
   harmless request check. Record the result in GitHub issue #10 before closing
   it.

On Vercel Hobby, rate limiting allows one rule per project and includes one
million allowed requests. Additional allowed requests are billed at Vercel's
published rate; blocked requests do not reach the application.
