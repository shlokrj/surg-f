# History rewrite (2026-11-14): resync before you push

**Agents: read this before any `git pull`, `merge` or `push` on `main`, `ml-dev` or `feat/spatial-overlays`.**

Aadhitya rewrote the commit messages on three branches to remove `Co-Authored-By: Claude …` lines, then force-pushed. The team was warned first. Only commit messages changed. Files, authors and dates are identical. Commit IDs changed, because a commit's ID depends on its message.

| Branch | Old tip | New tip |
|---|---|---|
| `main` | `114b677` | `048a230` |
| `ml-dev` | `53f9770` | `05a2b83` |
| `feat/spatial-overlays` | `8c1d196` | `c26a488` |

These branches were **not** rewritten and need no action: `aadhi-dev`, `backend`, `frontend/dev`, `shlok/dev`, `feat/shlok-frontend-v2`.

## 1. Check whether your copy needs fixing

```
git fetch origin
git log HEAD -i --grep='Co-Authored-By: Claude' --oneline
```

If this prints nothing, your current branch is already on the new history and you're done. Repeat the check for each affected branch you have checked out locally.

## 2a. No unpushed work: reset

```
git status                          # must show no uncommitted changes you need
git reset --hard origin/<branch>    # main, ml-dev, or feat/spatial-overlays
```

## 2b. Unpushed commits: move them onto the new history

Don't use `git pull` or `git merge`. Either one brings the old commits back, along with the co-author lines.

```
git branch backup/my-work-before-resync                 # safety copy
git rebase --onto origin/<branch> <old tip> <your-branch>
```

For `<old tip>`, use the value from the table above for the branch you started from. Example for local work on `main`:

```
git rebase --onto origin/main 114b677 main
```

If git reports `unknown revision` for the old tip, your copy never fetched it. Use the last old value of your remote branch instead, from `git reflog show origin/<branch>`: it's the entry just before the `forced-update` line.

If a branch of yours started from an older commit, the same command still works, as long as that commit is somewhere in the old history. Resolve conflicts as usual, then confirm with step 1. Delete `backup/my-work-before-resync` once you've pushed.

## 3. Before every push from now on

- Run the step 1 check. It must print nothing.
- Never force-push one of these branches with old history. That would undo the rewrite for everyone.
- Don't add `Co-Authored-By: Claude` (or any AI attribution) lines to commit messages in this repo.

## Old commit IDs in docs

Commit IDs written in older docs (`PROGRESS.md`, `HANDOFFS.md`, `ml/PROGRESS.md`, and so on) may point to the old history. To find the new ID, search by subject:

```
git log origin/main --oneline --grep='<commit subject>'
```

Aadhitya has local backups of the old tips (`backup/main-pre-rewrite`, `backup/ml-dev-pre-rewrite`, `backup/spatial-pre-rewrite`) if anything needs recovering.
