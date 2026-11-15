# Agent workflow

## Sync before editing

1. At the start of every task or resumed work session, run `git status --short --branch` and confirm the assigned branch. If unrelated changes are present, preserve them and keep them out of your commits. Stop before any sync or edit that would overwrite them.
2. Run `git fetch origin` and `git pull --ff-only` on the working branch. Pull `main` before creating a branch. On a feature branch, compare against `origin/main` and bring in newer shared changes before editing. Review relevant teammate branches with `git log --oneline origin/main..origin/<branch>` and inspect changes that affect your task. Coordinate with the owner before integrating work that is still on their branch.
3. If a pull fails, diagnose the reason. If local Git is unavailable and the task can be completed through GitHub, read the latest target revision, review relevant teammate refs, and base any write on the current remote files. Use a fast-forward or a write guarded by the current file revision. If you cannot establish a current base or safely reconcile divergence, report the blocker and pause edits. Preserve teammates' work and resolve conflicts before continuing. Never force-push, reset teammates' work, or silently stash edits. In a shared checkout, coordinate one sync and confirm the resulting revision before editing.
4. Read [SPEC.md](SPEC.md), [PROGRESS.md](PROGRESS.md), and any relevant [CONTRACTS.md](CONTRACTS.md) sections from the synced version. Confirm your scope with the owner before editing another lane or changing a shared interface. Use `main` for direct changes when explicitly authorized.

## Verify, document, and publish

1. For each substantial change, review the diff, run the relevant checks, and commit the intended paths with a lowercase Conventional Commit subject. Stage only intended changes. Use the configured Git identity for local commits and omit co-author trailers.
2. Before pushing, update your assigned row in [PROGRESS.md](PROGRESS.md) and any directly affected milestone. Record the date, status, branch or commit, the exact command or demo step and observed result, outstanding blockers, and the next handoff. If you committed implementation first, commit the documentation as a follow-up in the same push. Update the relevant Markdown when setup, contracts, decisions, data locations, or demo steps change. Preserve teammates' latest entries and distinguish verified results from proposals.
3. Fetch again before pushing. Check for new upstream commits and relevant changes on `origin/main`. Reconcile them safely and rerun affected checks if the base changed. Push normally, then verify the intended commits and Markdown updates are on GitHub. If a push is rejected, resync and inspect the incoming changes before retrying.
4. In the handoff, link the commit or PR and report the checks that ran, any remaining blocker, and who takes the next step.

## Active ownership and branch boundaries

Shlok owns general frontend design. Aadhi owns spatial data/model/evaluation/export; Mihir owns spatial player integration and browser verification. Follow [the current plan](../ml/LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow); earlier Shlok spatial assignments are superseded. Shlok and Mihir must coordinate shared frontend files and preserve each other's work.

Aadhi and Mihir push new spatial work to `feat/spatial-overlays`, not main, until publication is explicitly requested. Mihir separately requested publication of the already integrated `frontend/dev` work on 2026-11-14; `main` now contains it through `6d468dd`. That publication does not authorize future feature-branch work. Use separate checkouts, preserve concurrent commits and never force-push.
