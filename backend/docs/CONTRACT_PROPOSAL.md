# Proposed contract additions (not yet agreed)

Status: **proposal, 2026-11-14 (Rohan).** The backend serves these endpoints on branch `backend`. They are not shared contracts until the team agrees. Nothing below changes `GET /search`.

## Text to append to agent-kit/CONTRACTS.md

> Timeline API: `GET /cases/VID01/timeline` with optional `source=annotation|prediction` (default `annotation`). Return `case_id`, `source`, `segments` ordered by `start_sec` then `label`, and a per-label `summary` ordered by `total_sec` descending. Build segments and summary from the same rows as search; exclude fixture rows. An unknown case returns 404 with `{"detail": "Unknown case_id: <id>"}`. A known case with no rows for the chosen source returns empty lists.
>
> ```json
> {"case_id":"VID01","source":"annotation","segments":[{"label":"clipper","start_sec":674,"end_sec":690}],"summary":[{"label":"clipper","count":5,"total_sec":102,"first_sec":674}]}
> ```
>
> Quiz API: `GET /quiz` with optional integer `seed`. Return exactly 5 general questions about laparoscopic cholecystectomy: 3 `next_step`, then 2 `which_tool`. The quiz does not depend on any case or on Databricks. The same seed returns the same quiz. Each question carries its answer for client-side grading, and `search_q` is an instrument label for `/search` or null. Content comes from a reviewed static bank; `reviewed` stays false until a person with medical knowledge has verified it.
>
> ```json
> {"seed":1,"reviewed":false,"questions":[{"id":"tool-clip","type":"which_tool","prompt":"Which of these tools is used for this step: placing clips on the cystic duct and cystic artery?","options":[{"id":"a","text":"Scissors"},{"id":"b","text":"Clipper (clip applier)"},{"id":"c","text":"Irrigator (suction-irrigation)"},{"id":"d","text":"Grasper"}],"correct_option_id":"b","explanation":"...","search_q":"clipper"}]}
> ```
>
> Errors on every endpoint use `{"detail": "..."}`. FastAPI validation errors (422) may return `detail` as a list. A failed Databricks query returns 503.

> Chat API: `POST /chat` with JSON body `{"message": "<text>", "case_id": "VID01"}` (`case_id` optional, default `VID01`). Return `reply` (one or two sentences for the chat), `action` (`search`, `quiz`, `timeline`, `answer` or `none`), `data` and `router` (`llm`, `rules` or `genie`). For `search`, `quiz` and `timeline`, `data` has the shape of the matching GET endpoint; search results are limited to the requested case and to annotation rows. For `answer`, `data` is `{"columns": [], "rows": [], "sql": null}` or null. For `none`, `data` is null. A valid request always returns 200, including when routing or the data store fails; only invalid input returns 422. The backend writes every reply; the language model only chooses a feature.
>
> ```json
> {"reply":"Found 5 moments with the clipper in VID01. The first starts at 11:14.","action":"search","data":{"results":[{"case_id":"VID01","start_sec":674,"end_sec":690,"label":"clipper","source":"annotation"}]},"router":"rules"}
> ```

## Row to append to agent-kit/DECISIONS.md

> | 2026-11-14: Add `GET /cases/{case_id}/timeline` (chart) and `GET /quiz` (general, seeded, 5 questions) beside `/search`. The quiz uses a static bank in `backend/data/quiz_bank.json`, marked `reviewed: false` until medically verified | The frontend chart and quiz were built from six `/search` calls and per-video questions. One timeline call is cheaper and keeps predictions out of annotation counts. A curated bank keeps quiz content accurate and identical with or without Databricks. |

## Exact moves to promote

1. Copy `backend/fixtures/timeline.VID01.json` to `shared/timeline.fixture.json`.
2. Copy `backend/fixtures/quiz.seed-1.json` to `shared/quiz.fixture.json`.
3. Point `FixtureClipRepository` and the tests at the `shared/` copies, and delete the `backend/fixtures/` duplicates. Keep `timeline.VID02.json` in `backend/fixtures/` unless the team wants a second shared case.
4. Append the CONTRACTS.md text and the DECISIONS.md row above.
5. Update the frontend's fixture mode to read the two new `shared/` files.
6. After a person with medical knowledge has reviewed `backend/data/quiz_bank.json`, set `"reviewed": true` and record who reviewed it and when in DECISIONS.md.

## Open points for agreement

- **Chat (added 2026-11-14):** should the chat box move from `GET /interpret` to `POST /chat`, and should `/interpret` then be retired? Is the `answer` table shape acceptable, given that it has no matching GET endpoint? Examples: `backend/fixtures/chat.examples.json`.
- **Timeline labels (added 2026-11-14):** the live table now holds verb and target labels as `annotation` rows (VID01: 24 labels, 226 segments), with no column that separates them from instruments. Should `/cases/{case_id}/timeline` return only the six instruments, or should the table gain a category column?
- Should `/search` keep mixing `annotation` and `prediction` rows (current behavior), or take the same `source` filter as the timeline? Changing it would be a contract change.
- Is `case_id` case-sensitive (current behavior, `VID01` only), or should `vid01` also work?
- Should the frontend's `VITE_USE_FIXTURE` mode use these fixtures, or call the backend's fixture mode instead?

## Planned stage 3: video localization

The planned localization stage is a separate future proposal from the timeline/quiz contract above. No box route has been agreed. Consult the stage-3 plan for candidate fields and negotiate the spatial contract with ML/frontend before implementation.

See [Stage 3 localization plan](../../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
