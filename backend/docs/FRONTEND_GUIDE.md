# Backend guide for the frontend

Everything the frontend needs to wire up search, the instrument chart, and the quiz, without reading backend code. Every example response below is real output from the running backend, shortened where marked.

## Start the backend (Windows PowerShell)

```powershell
cd backend
python -m uv sync
python -m uv run uvicorn app.main:app --reload --port 8000
```

Then open:

- http://localhost:8000/search?q=clipper
- http://localhost:8000/cases/VID01/timeline
- http://localhost:8000/quiz?seed=1
- http://localhost:8000/docs for interactive docs. The raw schema is at `/openapi.json`.

## Environment and modes

| Setting | Where | Value |
|---|---|---|
| `VITE_BACKEND_URL` | `frontend/.env.local` | Backend origin. Default `http://localhost:8000` |
| `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN` | repo-root `.env` (git-ignored) | When all three are set, the backend uses live Databricks data |
| `SURGF_CORS_ORIGINS` | backend environment | Optional comma-separated origins. Default `http://localhost:5173,http://127.0.0.1:5173` |
| `SURGF_WARMUP` | backend environment | `0` turns off the startup query that wakes the SQL warehouse |

**Which mode am I in?** `GET /health` returns `{"status":"ok","mode":"databricks"}` or `{"status":"ok","mode":"fixture"}`.

| Endpoint | Fixture mode (no credentials) | Databricks mode |
|---|---|---|
| `/search` | Only `q=clipper` matches, and it returns the test row `fixture_01` (no video) | All dataset and model rows |
| `/cases/{id}/timeline` | Real saved data for `VID01` and `VID02` from [fixtures/](../fixtures/) | Live data for every case |
| `/quiz` | Identical in both modes | Identical in both modes |

If you use the frontend's own fixture mode (`VITE_USE_FIXTURE=true`), import [fixtures/timeline.VID01.json](../fixtures/timeline.VID01.json) and [fixtures/quiz.seed-1.json](../fixtures/quiz.seed-1.json). They match the response shapes exactly.

## Which UI element uses which endpoint

| UI element | Endpoint | Fields used |
|---|---|---|
| Search box and "Matching moments" list (`/timestamp`) | `GET /search?q=<label>` | `results[]`: `case_id`, `start_sec`, `end_sec`, `label` |
| Event timeline track under the video | `GET /cases/{case_id}/timeline` | `segments[]` |
| Instrument-usage chart (`/chart`) | `GET /cases/{case_id}/timeline` | `summary[]` |
| Quiz card (`/quiz`) | `GET /quiz` (optionally `?seed=`) | `questions[]`, `reviewed` |
| Quiz "Watch examples" button | `GET /search?q=<search_q>` | Hide the button when `search_q` is `null` |
| "Live data / demo data" badge | `GET /health` | `mode` |

**Changes from the current frontend:**
- **Chart:** `frontend/dev` builds the chart from six `/search` calls. One timeline call replaces them. It also leaves out model predictions by default; the six-search approach mixes them into VID02's annotation counts.
- **Quiz:** the current quiz asks about one video. The new quiz covers the operation in general.

## Errors

Every error body is JSON with a `detail` field.

| Status | When | Body |
|---|---|---|
| 404 | Timeline for a case with no rows | `{"detail": "Unknown case_id: VID99"}` |
| 422 | Missing, blank, or too-long `q`; a bad `case_id` or `source`; a `seed` outside 0–2147483647 | `{"detail": "q must contain a label"}`, or FastAPI's list form: `{"detail": [{"loc": [...], "msg": "...", ...}]}` |
| 503 | Databricks query failed | `{"detail": "Clip search is unavailable"}` |

Every response includes an `X-Request-ID` header. Quote it when reporting a bug; it matches the backend log line.

**Cold start:** if the SQL warehouse has been asleep, the first Databricks request can take about 45 s. The backend wakes the warehouse in the background at startup, but show a loading state anyway.

```ts
type ApiError = { detail: string | Array<{ loc: (string | number)[]; msg: string; type: string }> };
```

---

## 1. Search

**Purpose:** find every clip where an instrument is visible.
**Request:** `GET /search?q=<label>`
**Parameters:** `q` (required, 1–100 characters) is an instrument label: `clipper`, `grasper`, `hook`, `irrigator`, `bipolar`, or `scissors`. Matching ignores case and extra spaces, but the label must match exactly. Results are ordered by `case_id`, then `start_sec`, and include both `annotation` and `prediction` rows. No match returns `{"results": []}`.

```powershell
curl.exe -s "http://localhost:8000/search?q=clipper"
```

Response (live, first 3 of 237 rows):

```json
{"results":[
  {"case_id":"VID01","start_sec":674.0,"end_sec":690.0,"label":"clipper","source":"annotation"},
  {"case_id":"VID01","start_sec":698.0,"end_sec":747.0,"label":"clipper","source":"annotation"},
  {"case_id":"VID01","start_sec":749.0,"end_sec":753.0,"label":"clipper","source":"annotation"}
]}
```

```ts
type ClipSource = "annotation" | "prediction" | "fixture";
type Clip = {
  case_id: string;   // video ID, e.g. "VID01"; play /videos/<case_id>.mp4
  start_sec: number; // seek here
  end_sec: number;   // exclusive
  label: string;     // instrument label
  source: ClipSource;
};
type SearchResponse = { results: Clip[] };
```

Errors: 422, 503.

## 2. Timeline (chart)

**Purpose:** every instrument interval in one video, plus a per-instrument summary.
**Request:** `GET /cases/{case_id}/timeline`
**Parameters:**
- `case_id` (path): case-sensitive video ID, for example `VID01`.
- `source` (query, optional): `annotation` (default, the dataset ground truth) or `prediction` (model output, available for VID02 only for now).

**Ordering:**
- `segments`: by `start_sec`, then `label`. Different instruments can overlap in time, so draw one row per label.
- `summary`: by `total_sec`, largest first.

**Fields:**
- `count`: number of segments.
- `total_sec`: the sum of their durations.
- `first_sec`: the earliest start.

A known case with no rows for the chosen `source` returns empty lists, not a 404.

```powershell
curl.exe -s "http://localhost:8000/cases/VID01/timeline"
```

Response (live, `segments` shortened to 3 of 70):

```json
{
  "case_id": "VID01",
  "source": "annotation",
  "segments": [
    {"label": "grasper", "start_sec": 0.0, "end_sec": 5.0},
    {"label": "grasper", "start_sec": 10.0, "end_sec": 108.0},
    {"label": "hook", "start_sec": 20.0, "end_sec": 272.0}
  ],
  "summary": [
    {"label": "grasper", "count": 42, "total_sec": 1141.0, "first_sec": 0.0},
    {"label": "hook", "count": 9, "total_sec": 788.0, "first_sec": 20.0},
    {"label": "irrigator", "count": 9, "total_sec": 133.0, "first_sec": 291.0},
    {"label": "bipolar", "count": 4, "total_sec": 124.0, "first_sec": 325.0},
    {"label": "clipper", "count": 5, "total_sec": 102.0, "first_sec": 674.0},
    {"label": "scissors", "count": 1, "total_sec": 17.0, "first_sec": 860.0}
  ]
}
```

The full response is in [fixtures/timeline.VID01.json](../fixtures/timeline.VID01.json), and VID02 is in [fixtures/timeline.VID02.json](../fixtures/timeline.VID02.json).

```ts
type Segment = { label: string; start_sec: number; end_sec: number };
type LabelSummary = { label: string; count: number; total_sec: number; first_sec: number };
type TimelineResponse = {
  case_id: string;
  source: "annotation" | "prediction";
  segments: Segment[];
  summary: LabelSummary[];
};
```

Errors: 404 (`{"detail": "Unknown case_id: VID99"}`), 422, 503.

## 3. Quiz

**Purpose:** five study questions about laparoscopic cholecystectomy in general. The quiz isn't tied to any video and never calls Databricks.
**Request:** `GET /quiz`
**Parameters:** `seed` (optional integer, 0–2147483647). The same seed always returns the same quiz. Without a seed you get a random quiz, and the response's `seed` reproduces it.

**Structure:**
- Always 5 questions: 3 `next_step` questions, then 2 `which_tool` questions.
- No two questions share a topic.
- Each question has 4 options with IDs `a` to `d`, already shuffled.

**Grading:** the correct answer is in the response on purpose. Grade locally by comparing the chosen option's `id` with `correct_option_id`, then show `explanation`. When `search_q` is not `null`, offer "Watch examples" that calls `/search?q=<search_q>`.

**Medical review:** while `reviewed` is `false`, show a notice such as "Practice content, not yet medically reviewed."

```powershell
curl.exe -s "http://localhost:8000/quiz?seed=1"
```

Response (live, 2 of 5 questions shown; the full response is in [fixtures/quiz.seed-1.json](../fixtures/quiz.seed-1.json)):

```json
{
  "seed": 1,
  "reviewed": false,
  "questions": [
    {
      "id": "after-calot",
      "type": "next_step",
      "prompt": "What comes after this step: dissecting Calot's triangle until the critical view of safety is achieved?",
      "options": [
        {"id": "a", "text": "Place the gallbladder in a retrieval bag"},
        {"id": "b", "text": "Remove the gallbladder through a port site"},
        {"id": "c", "text": "Place the ports and insufflate the abdomen"},
        {"id": "d", "text": "Clip the cystic duct and cystic artery"}
      ],
      "correct_option_id": "d",
      "explanation": "The critical view of safety means Calot's triangle is cleared of fat and fibrous tissue, the lower part of the gallbladder is separated from the liver bed, and only two structures, the cystic duct and the cystic artery, are seen entering the gallbladder. Only then are they clipped.",
      "search_q": "clipper"
    },
    {
      "id": "tool-irrigate",
      "type": "which_tool",
      "prompt": "Which of these tools is used for this step: rinsing the operative field with fluid and suctioning it away?",
      "options": [
        {"id": "a", "text": "Clipper (clip applier)"},
        {"id": "b", "text": "Irrigator (suction-irrigation)"},
        {"id": "c", "text": "Scissors"},
        {"id": "d", "text": "Hook (L-hook electrode)"}
      ],
      "correct_option_id": "b",
      "explanation": "The suction-irrigation device (labeled irrigator) flushes the field with fluid and suctions away fluid and blood so the surgeon can see clearly.",
      "search_q": "irrigator"
    }
  ]
}
```

```ts
type QuizOption = { id: "a" | "b" | "c" | "d"; text: string };
type QuizQuestion = {
  id: string;                         // stable across seeds, e.g. "after-calot"
  type: "next_step" | "which_tool";
  prompt: string;
  options: QuizOption[];              // always 4
  correct_option_id: QuizOption["id"];
  explanation: string;
  search_q: string | null;            // label for /search, or null
};
type QuizResponse = { seed: number; reviewed: boolean; questions: QuizQuestion[] }; // always 5
```

Errors: 422 for an invalid `seed`.

## 4. Health

`GET /health` returns `{"status": "ok", "mode": "databricks" | "fixture"}`.

```ts
type HealthResponse = { status: "ok"; mode: "databricks" | "fixture" };
```
