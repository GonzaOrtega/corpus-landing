# Review ledgers

This folder is written by **review-gate**, a review protocol whose machinery lives in the
gonza-stack plugin (`claude-stack/stack/scripts/review-gate/cli.ts`). Each `pr-<n>/` folder holds:

- `gate.yaml`: what "done" means for that PR, its scope globs, the round cap. Human-owned.
- `ledger.yaml`: every reviewer finding with its verdict. Machine-owned; change it only through the CLI.
- `digest.md`: the human summary. Read this one.
- `findings/`: raw reviewer output per round, kept for audit.

Rules any agent must follow on a branch that has a ledger:

1. Do not edit code while `ledger.yaml` says `status: reviewing`, `awaiting-triage` or `frozen`.
2. Every code commit after intake carries one `Review-Gate: R-nn` trailer per finding it fixes, in
   the same trailer block as `Co-Authored-By`. Only findings whose verdict is `fix` may be cited.
3. Commits that touch only this folder carry `Review-Gate: ledger` (or `intake`). Never mix ledger
   and code changes in one commit.
4. Verdicts come from the human, in chat: `ok`, or `R-03 fix, R-07 no <reason>`. The only waiver is a
   message that starts with `skip review-gate <reason>`.
5. New findings after the ledger is frozen become issues, never commits.

CI runs `check` on every PR event and fails on any violation. Locally: `/review-gate <pr>`.
