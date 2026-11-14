# Team handoffs

Start each session with the synced branch, the current progress row, and the assigned scope. Use a separate branch per workstream. Agree together before changing a shared interface.

## Copy into your agent prompt

> Read root AGENTS.md and follow the Git sync rules. My lane is [lane]. My task is [task]. Read SPEC.md, CONTRACTS.md, and my progress row. Keep edits within [paths]. Verify [observable result]. Update my progress row with the branch, evidence, blockers, and next handoff.

## End each session

Record the branch or PR, what runs, the exact verification command or demo steps, any input still needed, and the next owner. If two people touch PROGRESS.md, preserve both updates when integrating.

## Shared `ml-dev` branch (Aadhitya + Shlok)

Both people and their agents commit and push to `ml-dev`. Update `main` only when Shlok explicitly requests it. Track separate work in [ML progress](../ml/PROGRESS.md): Shlok owns SurgVLP/features, and Aadhitya owns videos.

**One-time setup**
1. Run `git fetch && git checkout ml-dev`.
2. Create a repo-root `.env` (git-ignored) with `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Get the values from Aadhitya privately.
3. Keep data outside the repo, for example `~/madhacks2026/data/cholect50/`. Get labels with `curl -L -o samples.json https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json` (about 500 MB).

**Every session on the shared branch**
- **Start:** run `git checkout ml-dev && git pull --ff-only && git fetch origin && git merge origin/main`, so `ml-dev` has everything on `main`. If the pull or merge fails, stop and talk to each other. Never force-push, reset, or stash the other person's work.
- **Finish:** commit, fetch and reconcile incoming changes, then push with `git push origin ml-dev`. If the shared branch advanced, inspect and merge its changes before retrying; preserve both teammates' work. Do not push to `main` unless Shlok explicitly requests it.
- Make small commits that touch only your task's files. Announce in chat before you edit a file the other person is working on.
- Before ending a session, update `PROGRESS.md` (Databricks row for Aadhitya, Data and ML row for Shlok) with what was verified and what's next.

**First tasks** (see "Open questions and proposals" in PROGRESS.md)
1. ~~Import annotation clips~~ Done 2026-11-14, 3620 rows (see PROGRESS.md). To redo it:
   - Run `python3 databricks/make_clips_csv.py path/to/samples.json clips.csv`.
   - In Databricks, go to Catalog → `workspace` → `default` → Create → Table and upload `clips.csv` as `surgf_clip_staging`.
   - Run `databricks/import_clips.sql` with catalog `workspace` and schema `default`.
   - Check that `SELECT count(*) FROM workspace.default.surgf_clips WHERE source = 'annotation'` returns 3620, then record it.
2. Aadhitya (proposed): build `.mp4` files for 2 demo cases (VID01 done 2026-11-14 with `ml/make_case_video.py`; needs ffmpeg or `pip install imageio-ffmpeg`) from the frames at 1 fps, and build a Databricks training notebook with MLflow under `ml/`.
3. Shlok: Databricks serverless CPU adopted on 2026-11-14. Follow [ML setup](../ml/README.md) and run [the extraction notebook](../ml/extract_databricks.py) using `scripts/gpu_run.py start --cpu`. Don't download the full 64 GB. Work one case at a time: download frames, extract features, upload, delete frames. Fetch one case's frames with `python3 ml/download_case.py samples.json VID01 out_dir/`. Add `START END` seconds to fetch only one clip. Then set up frozen SurgVLP and extract bundles for 2–3 cases into `/Volumes/workspace/default/surgf/features/<case_id>/`, using the format in CONTRACTS.md.
