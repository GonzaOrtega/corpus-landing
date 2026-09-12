# Branch protection

## Status

`main` is protected. Every step in this runbook has been applied and verified by
API readback (2026-09-11). Nothing here is pending work — the commands are kept
because they are idempotent and are the reference for re-applying the contract
if a setting is ever changed by hand.

| Setting | State |
|---|---|
| Repository visibility | public |
| `main` protection | five §31 contexts, `strict`, `enforce_admins`, linear history, conversation resolution, no force-push, no deletion |
| Secret scanning | enabled |
| Secret scanning push protection | enabled |
| Dependabot alerts + security updates | enabled |
| Private vulnerability reporting | enabled |

## Why this file exists

Design spec §31 requires `main` to be protected with five required checks.
**That requirement could not be satisfied while this repository was private.**

GitHub's documentation states branch restrictions are available "in public
repositories owned by a GitHub Free organization and in all repositories owned
by an organization using GitHub Team or GitHub Enterprise Cloud." Protected
branches on *private* repositories are a paid (Pro / Team) feature. Rulesets,
the modern replacement, are likewise documented as GitHub Team and Enterprise.

So the gap was real and deliberate, not an oversight:

| Period | `main` protection | Enforcement mechanism |
|---|---|---|
| Private (repo creation → the flip) | **None available** | Convention + PR template + `secret-scan` workflow |
| Public (the flip onward) | Full §31 ruleset | GitHub branch protection |

This history matters when auditing early commits: the absence of protection on
anything before the flip is explained by the plan above, not by a lapse.

Two consequences of being private on GitHub Free, both now resolved:

- **Actions minutes were metered** (2,000/month) instead of unlimited. The
  required CI/Preview gates — notably `e2e` (Playwright) and `lighthouse` — are
  the expensive ones. Public repositories get unlimited standard-runner minutes,
  so the metering pressure is gone; the gates remain `pull_request`-only on
  their own merits, not to save quota.
- **GitHub secret scanning was not available** on private Free repositories.
  This is why `secret-scan.yml` runs gitleaks ourselves. Platform secret
  scanning and push protection are now enabled *as well* — keep both. They
  cover different moments: push protection blocks a secret at `git push`, before
  it ever reaches GitHub; platform scanning covers the repository history, while
  the gitleaks workflow is an independent **full-history** gate that runs on
  every push and PR and leaves CI-visible evidence of that scan.

## Required-check contract

Design spec §31 intentionally names these five branch-protection contexts:

```text
check
test
preview
e2e
lighthouse
```

The Preview workflow also exposes `preview-smoke`. It validates assertions that
only make sense against the deployed Preview artifact, but it is not one of the
five merge-required contexts in §31. Keep that distinction explicit when
configuring or auditing branch protection.

### Consequence for fork pull requests

`preview` and `e2e` both fail closed for fork PRs by design — they need Neon and
Vercel credentials, and the `e2e` runner image in GHCR is private. Because both
are *required* contexts, **a pull request from a fork can never go green**, and
therefore can never merge on its own. That is the intended trade-off, not a bug:
external contributions are accepted by a maintainer pushing the branch to this
repository and opening the PR from there. `CONTRIBUTING.md` is the place that
tells contributors this; keep the two documents in agreement.

## Working agreement

Most of this is now machine-enforced by the protection above. It is kept written
down because the habits are what keep pull requests cheap to review, and because
`secret-scan` is deliberately *not* one of the five required contexts.

- No direct commits to `main`.
- Every change lands via PR, squash-merged.
- `bun run check` and `bun run test` pass locally **before** opening the PR.
- The `secret-scan` workflow is never merged around, even though it is not
  technically a required check.

## The runbook — applied, kept for re-application

Run these in order. They are idempotent.

### 1. Make the repository public

```bash
gh repo edit GonzaOrtega/corpus-landing --visibility public --accept-visibility-change-consequences
```

### 2. Merge settings — squash only, per §31

```bash
gh api -X PATCH repos/GonzaOrtega/corpus-landing \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -F has_wiki=false \
  -F has_projects=false
```

### 3. Protect `main`

`required_approving_review_count` is `0` on purpose: GitHub does not let you
approve your own pull request, so any value above zero would deadlock a solo
maintainer. The PR itself is still mandatory — reviews are what is waived, not
the pull request or the checks.

```bash
gh api -X PUT repos/GonzaOrtega/corpus-landing/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check", "test", "preview", "e2e", "lighthouse"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": true,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "lock_branch": false
}
JSON
```

Mapping to §31: `strict: true` is "current with base";
`required_conversation_resolution` is "conversations resolved";
`enforce_admins: true` is "bypass disabled where supported";
`allow_force_pushes` / `allow_deletions` `false` are "no force-push, no deletion".

### 4. Enable free public-repo security features

Secret scanning and push protection are a *nested* object, so send them as JSON
rather than as `-F` field paths:

```bash
gh api -X PATCH repos/GonzaOrtega/corpus-landing --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
```

> **zsh trap.** The obvious form —
> `-F security_and_analysis[secret_scanning][status]=enabled` — **fails in zsh**
> with `zsh: no matches found`, because zsh glob-expands the square brackets as
> a filename character class and aborts before `gh` is ever invoked. bash does
> not do this, which is why the form looks fine when written. If you prefer the
> `-F` style, single-quote each argument. The JSON form above avoids the trap
> entirely and is what was actually used.

Dependabot alerts and automated security fixes are separate endpoints, and are
*not* the same thing as the version bumps configured in `.github/dependabot.yml`
— those already worked while private. These two are what surface a published CVE
in a dependency:

```bash
gh api -X PUT repos/GonzaOrtega/corpus-landing/vulnerability-alerts
gh api -X PUT repos/GonzaOrtega/corpus-landing/automated-security-fixes
```

Both return `204 No Content` on success and print nothing — silence is the
success signal here, not a sign that the command did not run.

Then enable **private vulnerability reporting** (Settings → Security), which
`SECURITY.md` points contributors to.

### 5. Verify, do not assume

Read the state back; never trust the response body of the call that set it.

```bash
gh api repos/GonzaOrtega/corpus-landing/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts,
         strict: .required_status_checks.strict,
         admins: .enforce_admins.enabled,
         convos: .required_conversation_resolution.enabled,
         force:  .allow_force_pushes.enabled}'

gh api repos/GonzaOrtega/corpus-landing --jq '.security_and_analysis'
gh api repos/GonzaOrtega/corpus-landing/private-vulnerability-reporting
gh api -i repos/GonzaOrtega/corpus-landing/vulnerability-alerts | head -1  # 204 = on, 404 = off
```

A required check only becomes selectable once it has reported at least once.
If step 3 rejects a context name, the workflow producing that job name has not
run yet on this repository — run it once, then re-apply.

## Known-off by omission

These settings appear in the repository API response and are currently
**disabled**, but GitHub documents generic-pattern scanning and validity checks
as features for organization-owned repositories with GitHub Secret Protection.
This is a personal public repository, so do not treat either as a free
public-repository setting or pending work unless the ownership or account model
changes:

- `secret_scanning_non_provider_patterns` — catches generic secrets (private
  keys, connection strings) beyond the known provider token formats.
- `secret_scanning_validity_checks` — reports whether a detected token is still
  live.
