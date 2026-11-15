# Genie plan: from typed text to an action

Status: **backend built and tested; Genie space not created yet (2026-11-14, Rohan).** The backend works without Genie today and starts using it as soon as a space ID is in `.env`.

## What Genie is, and what it is not

Databricks Genie turns a natural-language question into SQL over the tables in one **Genie space**, runs it on a SQL warehouse, and returns a short text answer plus the result rows. It can't call our API or return a custom "action". So Genie isn't the router. It is the part that answers free-form questions about the clip data.

## How a typed message becomes an action

The frontend sends whatever the user typed to `GET /interpret?q=<text>&case_id=<open video>`. The backend answers with a list of actions. There are four action types, matching the four commands in the UI:

| Action | Meaning | How the frontend carries it out |
|---|---|---|
| `timestamp` | Show moments for an instrument | Call `request` (`/search?q=clipper`), or show `results` if Genie attached them |
| `chart` | Show instrument usage for a video | Call `request` (`/cases/VID01/timeline`), or use `summary` if Genie attached it |
| `quiz` | Start the general quiz | Call `/quiz` |
| `model` | Open the 3D model view | No backend call |

The backend decides in two layers:

1. **Rules (instant, no network).** Slash commands (`/timestamp clipper`, `/quiz /chart`), quiz and model requests, and simple questions ("when was the clipper used?") are resolved by keyword rules in `backend/app/interpret.py`. The rules know instrument synonyms (clip applier, suction, L-hook) and video names ("video 2" becomes `VID02`).
2. **Genie (5 to 30 seconds).** Only questions the rules can't express go to Genie, and only when a Genie space is configured. Examples: "when was the hook used after minute 10?", "which instrument was used the longest?", "when were the grasper and hook used together?". The backend prefixes the open video (`For case_id 'VID01': ...`) and converts Genie's rows back into actions by their column names:
   - Columns `case_id, start_sec, end_sec, label` become a `timestamp` action with the clips attached.
   - Columns `label` plus `count`, `total_sec` or `first_sec` become a `chart` action with the summary attached.
   - Anything else comes back as Genie's text in `message` and the raw table in `genie.rows`.

If Genie isn't configured, fails, or times out, the rules' best guess is returned instead, so `/interpret` never fails because of Genie. Genie writes and runs its own SQL inside Databricks; our backend never executes SQL that Genie wrote.

## What exists in Databricks today (checked 2026-11-14)

- The team token (Aadhitya's account) can call the Genie API.
- The SQL warehouse in `DATABRICKS_HTTP_PATH` is a serverless Pro warehouse (`Serverless Starter Warehouse`, 2X-Small, stops after 10 idle minutes). Genie requires a Pro or serverless warehouse, so this one works.
- The only Genie space the token can see is Databricks' sample "Bakehouse Sales Starter Space". There is **no Surg+F space yet**.
- The backend's Genie client was tested end to end against that sample space: it returned a text answer, the SQL, and typed rows in 14.6 seconds.

## Setup steps

Whoever creates the space must be able to share it with the token's account (Aadhitya's). Creating it while logged in as that account is simplest.

1. In the Databricks workspace, open **Genie**, choose **New**, and select the table `workspace.default.surgf_clips` only. Adding only this table limits what Genie can read.
2. Choose the warehouse **Serverless Starter Warehouse**.
3. Name the space `Surg+F instrument timeline`.
4. Paste the **General instructions** below into the space's instructions.
5. Add the four **example SQL queries** below, each with its question. Example queries are the strongest way to steer Genie.
6. Add the **column descriptions** below in the space's data settings. This doesn't alter the table itself.
7. If the space was created under another account, share it with the token's account with at least **Can Run**.
8. Copy the space ID from the URL (`.../genie/rooms/<space_id>`) and add it to the repo-root `.env`:
   ```
   DATABRICKS_GENIE_SPACE_ID=<space_id>
   ```
9. Restart the backend and run the checks under "Verify" below.

### General instructions (paste as-is)

```
This space answers questions about when surgical instruments are visible in laparoscopic cholecystectomy (gallbladder removal) videos.

Table workspace.default.surgf_clips has one row per time interval in which one instrument is visible.
- case_id: the video, for example VID01. Questions usually start with "For case_id 'VID01':". Always filter to that case_id unless the user names another video or asks about all videos.
- start_sec, end_sec: seconds from the start of the video. end_sec is exclusive. Duration is end_sec - start_sec. "Minute 10" means 600 seconds.
- label: the instrument, lowercase, exactly one of: grasper, hook, irrigator, bipolar, clipper, scissors.
- source: 'annotation' (ground truth), 'prediction' (model output) or 'fixture' (test row).

Rules:
1. Always exclude source = 'fixture'.
2. Use only source = 'annotation' unless the user asks about predictions or the model.
3. Synonyms: clip applier = clipper; suction or irrigation = irrigator; L-hook or cautery hook = hook; bipolar forceps = bipolar; grasping forceps = grasper.
4. When the user asks when, where, show or find, return individual rows with exactly these columns: case_id, start_sec, end_sec, label, source. Order by case_id, start_sec. Do not aggregate.
5. When the user asks how many, how long, most, least or compare, return one row per instrument with exactly these columns: label, count (number of intervals), total_sec (sum of end_sec - start_sec), first_sec (min start_sec). Order by total_sec descending.
6. Two instruments are used together when their intervals overlap: a.start_sec < b.end_sec AND b.start_sec < a.end_sec. Return the overlap as case_id, start_sec, end_sec, label, source, where label is both names joined with ' + '.
7. The table only records instrument visibility. If asked about surgical steps, anatomy, or medical advice, say you can only answer questions about instrument timing.
```

### Example SQL queries (add each with its question)

```sql
-- For case_id 'VID01': when was the clipper first used?
SELECT case_id, start_sec, end_sec, label, source
FROM workspace.default.surgf_clips
WHERE case_id = 'VID01' AND label = 'clipper' AND source = 'annotation'
ORDER BY start_sec LIMIT 1;

-- For case_id 'VID01': when was the hook used after minute 10?
SELECT case_id, start_sec, end_sec, label, source
FROM workspace.default.surgf_clips
WHERE case_id = 'VID01' AND label = 'hook' AND source = 'annotation' AND start_sec >= 600
ORDER BY case_id, start_sec;

-- For case_id 'VID01': which instrument was used the longest?
SELECT label, count(*) AS count, sum(end_sec - start_sec) AS total_sec, min(start_sec) AS first_sec
FROM workspace.default.surgf_clips
WHERE case_id = 'VID01' AND source = 'annotation'
GROUP BY label ORDER BY total_sec DESC;

-- For case_id 'VID01': when were the grasper and the hook used at the same time?
SELECT a.case_id, greatest(a.start_sec, b.start_sec) AS start_sec, least(a.end_sec, b.end_sec) AS end_sec,
       concat(a.label, ' + ', b.label) AS label, a.source
FROM workspace.default.surgf_clips a
JOIN workspace.default.surgf_clips b
  ON a.case_id = b.case_id AND a.source = b.source
 AND a.start_sec < b.end_sec AND b.start_sec < a.end_sec
WHERE a.case_id = 'VID01' AND a.source = 'annotation' AND a.label = 'grasper' AND b.label = 'hook'
ORDER BY start_sec;
```

### Column descriptions

| Column | Description |
|---|---|
| `case_id` | Video ID, for example VID01 |
| `start_sec` | Interval start, in seconds from the start of the video |
| `end_sec` | Interval end, in seconds, exclusive |
| `label` | Instrument: grasper, hook, irrigator, bipolar, clipper or scissors |
| `source` | annotation (ground truth), prediction (model) or fixture (test row, always exclude) |

## Verify

With the space ID in `.env` and the backend running:

```powershell
curl.exe -s "http://localhost:8000/interpret?case_id=VID01&q=when%20was%20the%20clipper%20first%20used%3F"
```

Expected: `"interpreter": "genie"`, one `timestamp` action whose first result is `VID01` 674–690.

| Question (with `case_id=VID01`) | Expected |
|---|---|
| when was the clipper first used? | `timestamp` action, first clip 674–690 |
| which instrument was used the longest? | `chart` action; top row grasper, `total_sec` 1141 |
| when was the hook used after minute 10? | `timestamp` action, every `start_sec` at least 600 |
| what is the critical view of safety? | No actions; `message` says it only covers instrument timing |
| `/timestamp clipper` | `"interpreter": "rules"`, answered instantly, Genie not called |

The grasper total comes from the verified VID01 timeline (`backend/fixtures/timeline.VID01.json`).

## Limits to plan around

- **Latency:** the test call took 14.6 s. The UI shows its loading state during that time. Slash commands and simple questions never wait for Genie.
- **Rate limit:** Databricks limits how many questions the Conversation API accepts per minute for a workspace. I recall about 5 per minute, but that number is unverified; check the current Genie API docs before the demo and avoid rapid-fire free-form questions on stage.
- **Cost:** every Genie question runs a query on the SQL warehouse. A sleeping warehouse adds its cold start (about 45 s was measured for search).
- **Identity:** every app user's question runs as the token owner (Aadhitya's account). That is fine for a demo, not for production.
- **Accuracy:** Genie can write a wrong query. The response includes the SQL (`genie.sql`), so it can be shown or checked. The timeout is `SURGF_GENIE_TIMEOUT_SEC` (default 40).
- **No follow-ups yet:** each question starts a new Genie conversation. Follow-up questions would need the frontend to send back `genie.conversation_id`.

## Not chosen

**Update 2026-11-14:** a language-model router now exists as `POST /chat` (frontend guide, section 7). It uses a Databricks Foundation Model endpoint to pick a feature, and offers Genie to the model as an `ask_data` tool only when `DATABRICKS_GENIE_SPACE_ID` is set. `/interpret` is unchanged. The original note follows.

If the team wants a language model to classify intent for every message, Databricks Foundation Model APIs fit that job better than Genie. The rules cover the four commands today, so that isn't needed for the demo.
