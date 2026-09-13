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
| Paths | `/`, `/early-access/manage` |
| Counter key | IP |
| Algorithm | Fixed window |
| Limit | 10 requests per 60 seconds per region |
| Initial follow-up | Log for seven days |
| Enforcement follow-up | Default `429` response after the observation period |

The two paths cover signup, management-token resolution, and unsubscribe. They
do not cover the GET-only maintenance route or Preview deployments. The limit is
per region, so it constrains ordinary abuse and cost rather than acting as a
globally absolute cap.

## Current observation

The log-only rule was published on 2026-09-13 UTC. Eleven empty POST requests
to `/early-access/manage` each returned `405 Method Not Allowed`, proving that
they did not invoke a Server Action. Firewall overview recorded the resulting
threshold crossing as one log event for `early-access-server-actions`.

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
