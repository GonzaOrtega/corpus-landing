# Branch protection — deferred until public

## Why this file exists

Design spec §31 requires `main` to be protected with five required checks.
**That requirement cannot be satisfied while this repository is private.**

GitHub's documentation states branch restrictions are available "in public
repositories owned by a GitHub Free organization and in all repositories owned
by an organization using GitHub Team or GitHub Enterprise Cloud." Protected
branches on *private* repositories are a paid (Pro / Team) feature. Rulesets,
the modern replacement, are likewise documented as GitHub Team and Enterprise.

So the gap is real and deliberate, not an oversight:

| Period | `main` protection | Enforcement mechanism |
|---|---|---|
| Private (now → Task 21) | **None available** | Convention + PR template + `secret-scan` workflow |
| Public (Task 21 Step 6 onward) | Full §31 ruleset | GitHub branch protection |

Two other consequences of being private on GitHub Free:

- **Actions minutes are metered** (2,000/month) instead of unlimited. The
  required CI/Preview gates — notably `e2e` (Playwright) and `lighthouse` — are
  the expensive ones. Consider gating them to `pull_request` only, never
  `push`, and skipping them on draft PRs until the repository is public.
- **GitHub secret scanning is not available** on private Free repositories.
  This is why `secret-scan.yml` runs gitleaks ourselves rather than relying on
  the platform.

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

## Working agreement while unprotected

Nothing below is machine-enforced yet. It is enforced by habit and by the pull
request template.

- No direct commits to `main` after the first implementation PR exists.
- Every change lands via PR, squash-merged.
- `bun run check` and `bun run test` pass locally **before** opening the PR.
- The `secret-scan` workflow is never merged around, even though it is not
  technically a required check yet.

## Apply at the flip to public — Task 21, Step 6

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

```bash
gh api -X PATCH repos/GonzaOrtega/corpus-landing \
  -F security_and_analysis[secret_scanning][status]=enabled \
  -F security_and_analysis[secret_scanning_push_protection][status]=enabled
```

Then enable **private vulnerability reporting** (Settings → Security), which
`SECURITY.md` points contributors to.

### 5. Verify, do not assume

```bash
gh api repos/GonzaOrtega/corpus-landing/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts,
         strict: .required_status_checks.strict,
         admins: .enforce_admins.enabled,
         convos: .required_conversation_resolution.enabled,
         force:  .allow_force_pushes.enabled}'
```

A required check only becomes selectable once it has reported at least once.
If step 3 rejects a context name, the workflow producing that job name has not
run yet on this repository — run it once, then re-apply.
