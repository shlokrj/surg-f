# Agent workflow

## Sync before editing

1. Start every task and resumed session with git status, git fetch origin, and git pull --ff-only on the assigned branch. Sync main before branching. Review origin/main and relevant teammate branches for changes that affect your task. Coordinate with their owner before integrating unmerged work.
2. Preserve unrelated edits. If synchronization fails, diagnose it and resolve conflicts with the branch owner before editing. Never force-push, reset teammates' changes, or silently stash edits. If local Git is unavailable, verify the latest GitHub version and use a conflict-checked write, or report the blocker.
3. Read [SPEC.md](SPEC.md), [PROGRESS.md](PROGRESS.md), and relevant [CONTRACTS.md](CONTRACTS.md) sections. Confirm scope before changing another lane or a shared interface. Commit directly to main when explicitly authorized.

## Verify, document, and push

1. Review the diff, run relevant checks, and commit each substantial change with a lowercase Conventional Commit subject. Stage only intended changes and omit co-author trailers.
2. Update your assigned progress row and any affected milestone before pushing. Record the date, branch or commit, verification command and result, blockers, and next handoff. Update affected Markdown when setup, contracts, decisions, or demo steps change. Preserve teammates' entries. If implementation is already committed, include the documentation follow-up in the same push.
3. Fetch again before pushing. Reconcile incoming changes, rerun affected checks, push normally, and verify the commit and docs are on GitHub. Link the commit or PR in your handoff.
