# Contributing

Corpus Landing is the real, deployed landing page for Corpus — published under
[MIT](LICENSE) so it can be read, learned from, and reused. It is not a
template or a starter kit, and it is maintained by one person.

Read this first if you plan to open anything: the CI constraint in
[Code changes](#code-changes) is unusual, and it is deliberate.

## Security issues

**Do not open a public issue.** Follow [`SECURITY.md`](SECURITY.md) — use
GitHub's private vulnerability reporting (Security tab → *Report a
vulnerability*). You can expect an acknowledgement within 7 days.

That includes anything you notice while reading the code: a missing
authorization check, a way to reach a Server Action you should not, a secret
that should not be in history.

## Bugs, questions and ideas

Open an issue. Useful reports say what you did, what happened, and what you
expected. For anything visual, the URL and your browser and OS help a lot.

Two things that are **already known and intentionally documented**, so no need
to file them: there is no dedicated rate-limit service in v1 (see *Known
limitations* in the [README](README.md)), and the landing page carries an
accepted colour-contrast exception from the approved design.

## Code changes

**Pull requests from forks cannot pass CI, by design.** This is the thing to
understand before you spend time on a patch.

`main` requires five checks: `check`, `test`, `preview`, `e2e`, and
`lighthouse`. The last three need deployment credentials — a Vercel token and a
Neon API key — and the workflows **deliberately refuse to run them for a fork**
(see the fail-closed steps in `.github/workflows/preview.yml`). Withholding
secrets from untrusted branches is the single most important control protecting
this repository, and it is not going to be relaxed to make contribution
smoother.

The consequence is honest: a fork PR will show failing required checks that
**you cannot fix**, and it cannot merge on its own. A maintainer has to adopt
the branch into this repository to get it green.

So:

- **Small, self-contained fixes** — typos, a broken link, a clearly wrong
  comment, an obvious bug with a tight diff — are welcome as PRs. Expect the
  red checks; they are not about your change.
- **Anything larger** — new behaviour, a dependency, a schema change, anything
  touching signup, email, tokens, or retention — please open an issue first.
  Product behaviour, copy, and semantics are fixed by an approved design
  specification, and a PR that reinterprets them cannot be merged however good
  the code is.

### Dependency updates

Dependabot proposes updates here, but it **cannot open a pull request that
merges unattended**. That is structural, not a misconfiguration:

- It updates `package.json` and never `bun.lock`. Every install in this
  repository is frozen, so all six checks die on `lockfile had changes, but
  lockfile is frozen` before reaching a single gate.
- A Dependabot-triggered run reads secrets from the *Dependabot* store rather
  than the Actions store - the runner prints `Secret source: Dependabot`. So
  `NEON_API_KEY` and `VERCEL_*` are empty and `test`, `preview` and
  `lighthouse` fail. The fork guards above never trip, because the branch
  genuinely is in this repository and nothing marks it untrusted.

A maintainer adopts each branch instead:

```bash
bun run deps:adopt dependabot/npm_and_yarn/<branch-name>
```

That syncs `bun.lock`, proves a second frozen install is clean, runs `check` and
`test`, and refuses any branch that moves `@playwright/test` - those need the
shared runner image republished first. Pushing the result makes the maintainer
the triggering actor, which is what restores the Actions secrets.

Outside contributors need none of this. It is the same adoption step described
above, automated for the bot's branches.

### Working locally

Setup, prerequisites, and the environment-variable contract are in the
[README](README.md#getting-started). Never put real values in a tracked file:
`.env.example` carries **names only**, and that is enforced by a full-history
[gitleaks](https://github.com/gitleaks/gitleaks) scan on every pull request.

Before you open a PR:

```bash
bun run check   # typecheck + lint + stack conformance
bun run test    # Vitest
bun run test:e2e   # Playwright, in Docker
```

`bun` only — never `npm`, `yarn`, or `pnpm`. The lockfile is committed and CI
installs with `--frozen-lockfile`.

### Things that will block a merge

- **Architecture direction.** `core` declares ports, `adapters` implement them,
  and `core` never imports `adapters`. Concrete adapters are constructed only
  under `composition/capabilities/`. This is machine-checked by
  `bun run check`.
- **Hand-edited SQL.** Change `src/adapters/db/schema.ts`, then run
  `bunx drizzle-kit generate`. Never edit a migration by hand.
- **A new public HTTP endpoint.** Signup and management are Server Actions on
  purpose; there is no public signup REST API. The only API route is the
  authorized maintenance entry point.
- **PII or secrets in logs, fixtures, snapshots, or workflow YAML.** History is
  permanent and this repository is public.

The [pull request template](.github/pull_request_template.md) asks for a plan
packet and spec section. If you are an outside contributor, leave those blank —
they are internal bookkeeping. Do fill in **Public-repository safety** and
**Verification**, and paste real command output rather than "should pass".

## Licence

By contributing you agree your contribution is licensed under the
[MIT Licence](LICENSE).
