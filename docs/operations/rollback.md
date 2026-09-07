# Roll back production traffic

Rollback selects a previously known-good Vercel Production deployment
explicitly. It does not rebuild the current checkout and does not reverse
database migrations. The release record from
[production deployment](production-deploy.md) must retain the prior immutable
deployment URL or ID and its commit.

1. Coordinate with the production release operator: do not overlap rollback
   with an active production workflow. Wait for an active migration to finish
   and ensure no queued dispatch will promote immediately after rollback.
2. Select the recorded known-good deployment in the same Vercel project. Verify
   it was previously served in Production, remains available, and is compatible
   with the database schema currently applied. Review its environment/build
   configuration and scheduled maintenance behavior.
3. With Vercel CLI **59.11.7**, supply `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
   `VERCEL_PROJECT_ID` through the approved secret mechanism. Set
   `KNOWN_GOOD_DEPLOYMENT` to the explicit recorded ID or credential-free
   immutable URL. Do not paste a token into a command/history or enable tracing.
4. Execute the operator-approved traffic rollback:

   ```sh
   vercel inspect "$KNOWN_GOOD_DEPLOYMENT" --token="$VERCEL_TOKEN"
   vercel rollback "$KNOWN_GOOD_DEPLOYMENT" --yes --timeout=5m --token="$VERCEL_TOKEN"
   vercel rollback status --token="$VERCEL_TOKEN"
   ```

5. Verify the production domain and expected behavior for that previous
   release stage, inspect error signals, and record the selected deployment,
   incident reason and time. The launched-only smoke suite may not apply to a
   known-good early-access release. Do not submit real signup as a health probe.

Never run bare `vercel rollback` with an implicit target. If the chosen
deployment is not eligible for rollback under the account plan, stop and
select an eligible known-good Production target. An explicitly approved
`vercel promote "$KNOWN_GOOD_DEPLOYMENT" --yes --timeout=5m
--token="$VERCEL_TOKEN"` can also assign an existing Production deployment;
verify its Production target and eligibility first. Do not substitute Preview,
which can trigger a new Production build.

Vercel's [instant rollback limitations](https://vercel.com/docs/instant-rollback)
and [CLI rollback contract](https://vercel.com/docs/cli/rollback) apply: Hobby
supports the previous Production deployment; Pro/Enterprise can select a
deployment previously aliased to Production. Build-time configuration and cron
configuration come from the selected deployment. Changing an environment
variable now does not rebuild the old artifact.

## Database discipline: expand → deploy → contract

Expand with additive, generated migrations that both the old and new releases
can use. Apply them through the direct `DATABASE_URL_UNPOOLED` connection, then
deploy and verify. Keep old columns/constraints and compatible data semantics
through the rollback window. Only after stability and separate review should
a later release contract the schema.

Traffic rollback leaves the expanded schema in place. Do not run destructive
down migrations, reset production data, or restore a database snapshot as an
automatic part of rollback. If a migration has broken old-version
compatibility, assess the database issue and prepare a reviewed forward fix;
repointing traffic alone cannot repair it. A migration completed before a
failed smoke remains applied, even though the old site kept serving.

This document and the production workflow implement the release procedure;
neither has executed a deploy, promotion, rollback, or external settings change
as part of repository development.
