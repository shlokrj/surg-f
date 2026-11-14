# Team handoffs

Start each session with the synced branch, the current progress row, and the assigned scope. Use a separate branch per workstream. Agree together before changing a shared interface.

## Copy into your agent prompt

> Read root AGENTS.md and follow the Git sync rules. My lane is [lane]. My task is [task]. Read SPEC.md, CONTRACTS.md, and my progress row. Keep edits within [paths]. Verify [observable result]. Update my progress row with the branch, evidence, blockers, and next handoff.

## End each session

Record the branch or PR, what runs, the exact verification command or demo steps, any input still needed, and the next owner. If two people touch PROGRESS.md, preserve both updates when integrating.

## Data/ML → frontend (2026-11-14)

Videos for VID01 and VID02 are hosted. Fetch them with `python scripts/fetch_videos.py VID01 VID02`. Search returns clips from 50 cases, but only those two have video, and it includes noisy VID02 `prediction` rows from the baseline model. See [frontend/README.md](../frontend/README.md#videos-and-data-from-dataml-2026-11-14) for details and the integration check.

## Shared `ml-dev` branch (Aadhitya + Shlok)

Both people and their agents commit and push to `ml-dev`. Update `main` only when Shlok explicitly requests it. Track separate work in [ML progress](../ml/PROGRESS.md): Shlok owns SurgVLP/features, coverage analysis, dataset splits, classifier training, and MLflow. Aadhitya owns videos, prediction export/import, and clip-level evaluation.

**One-time setup**
1. Run `git fetch && git checkout ml-dev`.
2. Create a repo-root `.env` (git-ignored) with `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Get the values from Aadhitya privately.
3. Keep data outside the repo, for example `~/madhacks2026/data/cholect50/`. Get labels with `curl -L -o samples.json https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json` (about 500 MB).

**Every session on the shared branch**
- **Start:** run `git checkout ml-dev && git pull --ff-only && git fetch origin && git merge origin/main`, so `ml-dev` has everything on `main`. If the pull or merge fails, stop and talk to each other. Never force-push, reset, or stash the other person's work.
- **Finish:** commit, fetch and reconcile incoming changes, then push with `git push origin ml-dev`. If the shared branch advanced, inspect and merge its changes before retrying; preserve both teammates' work. Do not push to `main` unless Shlok explicitly requests it.
- Make small commits that touch only your task's files. Announce in chat before you edit a file the other person is working on.
- Before ending a session, update `PROGRESS.md` (Databricks row for Aadhitya, Data and ML row for Shlok) with what was verified and what's next.

## Current ML tasks

Use the [assigned parallel work](../ml/PROGRESS.md#assigned-parallel-work-2026-11-14) as the current task list and acceptance criteria.

- **Shlok starts with:** annotation coverage audit and a fixed surgery-level split, then configurable Databricks training. Own training/model changes and the first extraction group listed in the ML tracker.
- **Aadhitya starts with:** export/import of the available baseline predictions, a standalone clip evaluator with synthetic checks, and VID02 video hosting. Own the second extraction group listed in the ML tracker.
- **Handoff:** Shlok supplies the split and model artifacts; Aadhitya supplies prediction import evidence, clip metrics, and frontend video instructions. The baseline model path and environment are in Shlok's progress section.
- **While tests run:** use separate worktrees/checkouts, preserve the tested revision, and check existing runs/bundles before launching extraction. Coordinate changes to model formats or shared files. Do not tune on the final test surgeries.

The annotation import and two-case baseline are recorded as complete. The expanded model and clip evaluation are assigned work, not verified results.
