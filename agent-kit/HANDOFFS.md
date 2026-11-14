# Team handoffs

Start each session with the synced branch, the current progress row, and the assigned scope. Use a separate branch per workstream. Agree together before changing a shared interface.

## Copy into your agent prompt

> Read root AGENTS.md and follow the Git sync rules. My lane is [lane]. My task is [task]. Read SPEC.md, CONTRACTS.md, and my progress row. Keep edits within [paths]. Verify [observable result]. Update my progress row with the branch, evidence, blockers, and next handoff.

## End each session

Record the branch or PR, what runs, the exact verification command or demo steps, any input still needed, and the next owner. If two people touch PROGRESS.md, preserve both updates when integrating.

## Shared `ml-dev` branch (Aadhitya + ML owner)

Both people and their agents commit to `ml-dev`. Merge to `main` through a PR.

**One-time setup**
1. Run `git fetch && git checkout ml-dev`.
2. Create a repo-root `.env` (git-ignored) with `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Get the values from Aadhitya privately.
3. Keep data outside the repo, for example `~/madhacks2026/data/cholect50/`. Get labels with `curl -L -o samples.json https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json` (about 500 MB).

**Every session on the shared branch**
- Run `git pull --ff-only` before you start editing and again right before you push. If the pull fails, stop and talk to each other. Never force-push, reset, or stash the other person's work.
- Make small commits that touch only your task's files. Announce in chat before you edit a file the other person is working on.
- Before ending a session, update `PROGRESS.md` (Databricks row for Aadhitya, Data and ML row for the ML owner) with what was verified and what's next.

**First tasks** (see "Open questions and proposals" in PROGRESS.md)
1. Import annotation clips. Either person can do it.
   - Run `python3 databricks/make_clips_csv.py path/to/samples.json clips.csv`.
   - In Databricks, go to Catalog → `workspace` → `default` → Create → Table and upload `clips.csv` as `surgf_clip_staging`.
   - Run `databricks/import_clips.sql` with catalog `workspace` and schema `default`.
   - Check that `SELECT count(*) FROM workspace.default.surgf_clips WHERE source = 'annotation'` returns 3620, then record it.
2. Aadhitya (proposed): build `.mp4` files for 2 demo cases from the frames at 1 fps, and build a Databricks training notebook with MLflow under `ml/`.
3. ML owner (proposed): set up frozen SurgVLP and extract bundles for 2–3 cases into `/Volumes/workspace/default/surgf/features/<case_id>/`, using the format in CONTRACTS.md.
