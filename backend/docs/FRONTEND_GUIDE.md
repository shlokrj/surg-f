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
- http://localhost:8000/interpret?case_id=VID01&q=when%20was%20the%20clipper%20used
- http://localhost:8000/docs for interactive docs. The raw schema is at `/openapi.json`.

## Environment and modes

| Setting | Where | Value |
|---|---|---|
| `VITE_BACKEND_URL` | `frontend/.env.local` | Backend origin. Default `http://localhost:8000` |
| `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN` | repo-root `.env` (git-ignored) | When all three are set, the backend uses live Databricks data |
| `SURGF_CORS_ORIGINS` | backend environment | Optional comma-separated origins. Default `http://localhost:5173,http://127.0.0.1:5173` |
| `SURGF_WARMUP` | backend environment | `0` turns off the startup query that wakes the SQL warehouse |
| `DATABRICKS_GENIE_SPACE_ID` | repo-root `.env` | Optional. Turns on Genie for free-form questions in `/interpret` and `/chat`. The team space is `01f1e09d399e101dbee5a37e935198bf` (Lil Doc) |
| `DATABRICKS_CHAT_ENDPOINT` | repo-root `.env` | Optional. Name of the Databricks serving endpoint that routes `/chat` messages, for example `databricks-meta-llama-3-3-70b-instruct`. Without it, keyword rules route |
| `SURGF_CHAT_TIMEOUT_SEC` | backend environment | Optional. Time limit for the chat model before the rules take over. Default `8` |

**Which mode am I in?** `GET /health` returns `{"status":"ok","mode":"databricks"}` or `{"status":"ok","mode":"fixture"}`.

| Endpoint | Fixture mode (no credentials) | Databricks mode |
|---|---|---|
| `/search` | Only `q=clipper` matches, and it returns the test row `fixture_01` (no video) | All dataset and model rows |
| `/cases/{id}/timeline` | Real saved data for `VID01` and `VID02` from [fixtures/](../fixtures/) | Live data for every case |
| `/quiz` | Identical in both modes | Identical in both modes |
| `/chat` | Keyword rules; search and timeline use the saved `VID01` and `VID02` data | Chat model if configured, otherwise keyword rules; live data |

If you use the frontend's own fixture mode (`VITE_USE_FIXTURE=true`), import [fixtures/timeline.VID01.json](../fixtures/timeline.VID01.json) and [fixtures/quiz.seed-1.json](../fixtures/quiz.seed-1.json). They match the response shapes exactly.

## Which UI element uses which endpoint

| UI element | Endpoint | Fields used |
|---|---|---|
| Search box and "Matching moments" list (`/timestamp`) | `GET /search?q=<label>` | `results[]`: `case_id`, `start_sec`, `end_sec`, `label` |
| Event timeline track under the video | `GET /cases/{case_id}/timeline` | `segments[]` |
| Instrument-usage chart (`/chart`) | `GET /cases/{case_id}/timeline` | `summary[]` |
| Quiz card (`/quiz`) | `GET /quiz` (optionally `?seed=`) | `questions[]`, `reviewed` |
| Quiz "Watch examples" button | `GET /search?q=<search_q>` | Hide the button when `search_q` is `null` |
| Search bar submit (any typed text or slash command) | `GET /interpret?q=<text>&case_id=<id>` | `actions[]`, `message`, `suggestions` |
| Chat box (one call that returns the reply and the data) | `POST /chat` | `reply`, `action`, `data`. See section 7 |
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

## 5. Interpret (typed text to actions)

**Purpose:** send whatever the user typed in the search bar and get back what to do. This replaces the frontend's own keyword matching.
**Request:** `GET /interpret?q=<text>&case_id=<open video>`
**Parameters:**
- `q` (required, 1–300 characters): the typed text, including any slash commands. When the text contains slash commands, only those commands decide the actions.
- `case_id` (optional): the video currently open. It is used when the text names no video.

**Actions:** `actions` is a list in display order. Each has a `type`:

| `type` | Do this |
|---|---|
| `timestamp` | If `results` is not null, show those clips. Otherwise call `request` (for example `/search?q=clipper`) and keep the clips for `case_id` |
| `chart` | If `summary` is not null, Genie already computed it. Otherwise call `request` (for example `/cases/VID01/timeline`) |
| `quiz` | Call `request` (`/quiz`) |
| `model` | Open the 3D model view; `request` is null |

**Reply text:** show `message` in the chat panel. When `actions` is empty, the request was not understood: show `message` and offer `suggestions`.

**Speed:** `interpreter` is `rules` (answered instantly) or `genie` (Databricks Genie answered a free-form question, which takes 5 to 30 seconds, so show a loading state). Genie is only used when the backend has `DATABRICKS_GENIE_SPACE_ID` set; see [GENIE_PLAN.md](GENIE_PLAN.md). If Genie fails, the rules' answer is returned and `genie.error` is set.

```powershell
curl.exe -s "http://localhost:8000/interpret?case_id=VID01&q=%2Ftimestamp%20clipper%20%2Fquiz"
```

Response (real):

```json
{
  "query": "/timestamp clipper /quiz",
  "interpreter": "rules",
  "actions": [
    {
      "type": "timestamp",
      "case_id": "VID01",
      "label": "clipper",
      "request": "/search?q=clipper",
      "results": null,
      "summary": null
    },
    {
      "type": "quiz",
      "case_id": null,
      "label": null,
      "request": "/quiz",
      "results": null,
      "summary": null
    }
  ],
  "message": "Showing moments with the clipper in VID01 and a five-question quiz on the operation.",
  "suggestions": [],
  "genie": null
}
```

```ts
type Action = {
  type: "timestamp" | "chart" | "quiz" | "model";
  case_id: string | null;         // set for timestamp and chart
  label: string | null;           // instrument for timestamp
  request: string | null;         // backend path to call, or null
  results: Clip[] | null;         // clips from Genie; show instead of calling request
  summary: LabelSummary[] | null; // totals from Genie for a chart
};
type GenieTrace = {
  conversation_id: string | null;
  sql: string | null;
  description: string | null;
  columns: string[];
  rows: unknown[][];
  error: string | null;
};
type InterpretResponse = {
  query: string;
  interpreter: "rules" | "genie";
  actions: Action[];
  message: string;
  suggestions: string[];
  genie: GenieTrace | null;
};
```

Errors: 422 for a blank or too-long `q`, or a bad `case_id`.

## 6. Steps (default timeline)

**Purpose:** the steps of the operation in one video, in time order, for the default timeline.
**Request:** `GET /cases/{case_id}/steps`
**Data:** real phase annotations from the Cholec80 dataset, saved in `backend/fixtures/steps.VID01.json` and `steps.VID02.json`. The response is the same with or without Databricks. Only VID01 and VID02 have steps; other cases return 404 `{"detail": "No steps for case_id: VID99"}`.

```powershell
curl.exe -s "http://localhost:8000/cases/VID01/steps"
```

Response (real, 2 of 7 steps shown):

```json
{
  "case_id": "VID01",
  "source": "cholec80_phase",
  "steps": [
    {"order": 1, "key": "Preparation", "label": "Preparation", "start_sec": 0.0, "end_sec": 21.0},
    {"order": 3, "key": "ClippingCutting", "label": "Clipping and cutting", "start_sec": 673.0, "end_sec": 887.0}
  ]
}
```

```ts
type Step = { order: number; key: string; label: string; start_sec: number; end_sec: number };
type StepsResponse = { case_id: string; source: string; steps: Step[] };
```

## 7. Chat (one message in, one thing to render out)

**Purpose:** the chat box. Send what the user typed; the backend decides which feature to run and returns the reply text plus the data to render. This is the simplest way to wire the chat: one call, no follow-up request.

**Request:** `POST /chat` with a JSON body.

| Field | Required | Meaning |
|---|---|---|
| `message` | yes | What the user typed, 1 to 300 characters |
| `case_id` | no | The open video. Default `VID01`. A message that names a video ("video 2") overrides it |
| `video_duration_sec` | no | The player's `video.duration`. "How long is this video" is then answered instantly from it, and Genie questions carry it as `(video length m:ss)` |

```powershell
curl.exe -s -X POST "http://localhost:8000/chat" -H "Content-Type: application/json" -d '{\"message\": \"show me when the clipper is used\", \"case_id\": \"VID01\"}'
```

```js
const response = await fetch(`${backendUrl}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, case_id: caseId }),
});
const { reply, action, data, router } = await response.json();
```

**Response type:** `SearchResponse`, `QuizResponse` and `TimelineResponse` are the types from sections 1 to 3.

```ts
type ChatResponse =
  | { reply: string; action: "search";   data: SearchResponse;   router: Router }
  | { reply: string; action: "quiz";     data: QuizResponse;     router: Router }
  | { reply: string; action: "study_quiz"; data: StudyQuiz;      router: "genie" }
  | { reply: string; action: "timeline"; data: TimelineResponse; router: Router }
  | { reply: string; action: "answer";   data: AnswerTable | null; router: Router }
  | { reply: string; action: "model";    data: ModelData;        router: Router }
  | { reply: string; action: "none";     data: null;             router: Router };

type Router = "llm" | "rules" | "genie";   // which path decided; for debugging and the demo
type ModelData = { case_id: string; step_key: string | null; step_label: string | null };
type AnswerTable = { columns: string[]; rows: unknown[][]; sql: string | null };
type StudyQuiz = { items: {
  question_number: number; question: string; answer: string; explanation: string | null;
  source: string;            // "data" (from this video) or "general"
  case_id: string | null; start_sec: number | null; end_sec: number | null;
}[] };
```

**Lil Doc study modes (2026-11-14, Aadhitya):** before any router, advice, drug/dose, patient and "how well was the surgery done" questions get the fixed `none` reply and never reach Genie. When Genie is set up, quiz requests ("quiz me on the instruments", "flashcards"), video-length questions and general educational questions ("what tools are typically used in a cholecystectomy", "what is the Calot triangle") go straight to Genie. A Genie quiz table becomes `study_quiz` (render questions with answers hidden behind a reveal, plus a "show in video" seek when `case_id` matches the open video and `start_sec` is set). If Genie fails or returns no quiz table, quiz requests get the bank quiz (`quiz`). Genie prose answers without a table keep up to four sentences; data answers keep two.

**What to render for each action:** always show `reply` as the assistant's chat message, then:

| `action` | `data` | UI component to render |
|---|---|---|
| `search` | Same shape as `GET /search`, already limited to the open video and to annotation rows | The "Matching moments" list. Clicking a result seeks the player to `start_sec`. An empty `results` list is possible; `reply` then says nothing was found |
| `quiz` | Same as `GET /quiz` | The quiz card |
| `timeline` | Same as `GET /cases/{case_id}/timeline` | The instrument chart (`summary`) and timeline track (`segments`) |
| `answer` | A small table, or `null`. For rankings and usage questions the backend computes it, with columns `label`, `count`, `total_sec`, `first_sec` and `sql: null`. From Genie the columns vary | The reply text, plus an optional plain table of `columns` and `rows`. `reply` already states the answer in words |
| `model` | Which step to show: `step_key` is a phase name from `GET /cases/{case_id}/steps`, or `null` for the step the video is on | The 3D model panel. If `step_key` is set, seek the video to that step's `start_sec`; the model follows the video |
| `none` | `null` | Only the reply. Used for medical-advice and off-topic messages, an unknown video, and a data outage |

**How the backend decides (you don't need to handle any of this):**
1. A Databricks chat model picks one of the features, with a hard 8-second limit. It never writes the reply and never answers from its own knowledge; the backend writes every reply. Besides search, quiz and timeline, it can pick four data tools that the backend computes itself from the timeline rows: an instrument inside a time window ("hook after minute 10", returned as `search`), a ranking ("used the longest", `answer`), one instrument's usage ("how long was the clipper used", `answer`), and two instruments visible together (`search`, with labels such as `grasper + hook`). Genie is only asked when none of these fits.
2. Keyword rules answer when the model is not configured, is slow, fails, or picks something invalid. In fixture mode (no credentials) the rules always answer.
3. `/chat` returns 200 for every valid request, including when routing or the data store fails. The only error is 422 for a blank or too-long `message` or a bad `case_id`.

**Latency (measured 2026-11-14, live Databricks):** 0.5 to 1.7 s through the model, including the data questions that used to take 11 to 14 s through Genie, and 0.3 to 1.0 s through the rules. Only a question that no tool covers still goes to Genie (`router: genie`, about 12 s), for example "what is the average length of a grasper interval?". The first data request after the SQL warehouse has slept can take much longer, so keep a loading state.

**Real example per action** (also in [fixtures/chat.examples.json](../fixtures/chat.examples.json), with full lists):

`search`: `{"message": "show me when the clipper is used"}`
```json
{
  "reply": "Found 5 moments with the clipper in VID01. The first starts at 11:14.",
  "action": "search",
  "data": {
    "results": [
      {
        "case_id": "VID01",
        "start_sec": 674.0,
        "end_sec": 690.0,
        "label": "clipper",
        "source": "annotation"
      },
      {
        "case_id": "VID01",
        "start_sec": 698.0,
        "end_sec": 747.0,
        "label": "clipper",
        "source": "annotation"
      },
      {
        "case_id": "VID01",
        "start_sec": 749.0,
        "end_sec": 753.0,
        "label": "clipper",
        "source": "annotation"
      },
      {
        "case_id": "VID01",
        "start_sec": 754.0,
        "end_sec": 758.0,
        "label": "clipper",
        "source": "annotation"
      },
      {
        "case_id": "VID01",
        "start_sec": 815.0,
        "end_sec": 844.0,
        "label": "clipper",
        "source": "annotation"
      }
    ]
  },
  "router": "rules"
}
```

`quiz`: `{"message": "quiz me"}` (first of 5 questions shown)
```json
{
  "reply": "Here is a five-question quiz on the operation.",
  "action": "quiz",
  "data": {
    "seed": 1861098177,
    "reviewed": false,
    "questions": [
      {
        "id": "after-cleaning",
        "type": "next_step",
        "prompt": "What comes after this step: cleaning and coagulating the operative field?",
        "options": [
          {
            "id": "a",
            "text": "Remove the gallbladder through a port site"
          },
          {
            "id": "b",
            "text": "Cut the cystic duct and cystic artery between the clips"
          },
          {
            "id": "c",
            "text": "Place the ports and insufflate the abdomen"
          },
          {
            "id": "d",
            "text": "Dissect Calot's triangle to expose the cystic duct and cystic artery"
          }
        ],
        "correct_option_id": "a",
        "explanation": "In the standard phase order, the bagged gallbladder is then removed from the abdomen through one of the port sites. The order of the last steps can vary in practice.",
        "search_q": null
      }
    ]
  },
  "router": "rules"
}
```

`timeline`: `{"message": "chart the tools used in this case"}` (first 2 of 70 segments and 2 of 6 summary rows shown)
```json
{
  "reply": "Here is the instrument timeline for VID01: 70 segments across 6 instruments.",
  "action": "timeline",
  "data": {
    "case_id": "VID01",
    "source": "annotation",
    "segments": [
      {
        "label": "grasper",
        "start_sec": 0.0,
        "end_sec": 5.0
      },
      {
        "label": "grasper",
        "start_sec": 10.0,
        "end_sec": 108.0
      }
    ],
    "summary": [
      {
        "label": "grasper",
        "count": 42,
        "total_sec": 1141.0,
        "first_sec": 0.0
      },
      {
        "label": "hook",
        "count": 9,
        "total_sec": 788.0,
        "first_sec": 20.0
      }
    ]
  },
  "router": "rules"
}
```

`none`: `{"message": "what dose of antibiotics should I give"}`
```json
{
  "reply": "I'm a study aid, so I can't give medical advice, answer about a specific patient or judge how well this operation was done. Try an instrument name such as \"clipper\", a general question about the procedure, or ask for a quiz.",
  "action": "none",
  "data": null,
  "router": "rules"
}
```

`answer`: `{"message": "which instrument was used the longest?"}` (answered by Genie in 13.8 s)
```json
{
  "reply": "For case_id 'VID01', the instrument used for the longest total time was the grasper, with a total of 1141 seconds. The next longest was the hook at 788 seconds.",
  "action": "answer",
  "data": {
    "columns": [
      "label",
      "count",
      "total_sec",
      "first_sec"
    ],
    "rows": [
      [
        "grasper",
        42,
        1141.0,
        0.0
      ],
      [
        "hook",
        9,
        788.0,
        20.0
      ],
      [
        "irrigator",
        9,
        133.0,
        291.0
      ],
      [
        "bipolar",
        4,
        124.0,
        325.0
      ],
      [
        "clipper",
        5,
        102.0,
        674.0
      ],
      [
        "scissors",
        1,
        17.0,
        860.0
      ]
    ],
    "sql": "SELECT label, count(*) AS count, sum(end_sec - start_sec) AS total_sec, min(start_sec) AS first_sec\nFROM workspace.default.surgf_clips\nWHERE case_id = 'VID01' AND source = 'annotation'\n  AND label IN ('grasper','hook','irrigator','bipolar','clipper','scissors')\nGROUP BY label ORDER BY total_sec DESC"
  },
  "router": "genie"
}
```

**Things to know:**
- **The timeline returns the six instruments only.** The live clip table also holds verb and target labels such as `grasp` and `gallbladder`. Since 2026-11-14 `GET /cases/{case_id}/timeline` and the chat `timeline` action leave them out, so live VID01 matches the saved fixture again (70 segments, 6 labels). Your existing filter to the six labels in `main.js` is harmless and can stay.
- **Which endpoint for which input (decided 2026-11-14, Rohan):** use `POST /chat` for free-typed chat messages. Keep `GET /interpret` for the search bar's slash commands, because it can return several actions at once (`/quiz /chart`) and `/chat` returns exactly one. `/interpret` is not being retired.
- **Chat search is narrower than `GET /search`:** it returns annotation rows for the open video only, which is what the matching-moments list shows. Call `GET /search` directly when you need every video or model predictions.
- **Already wired (2026-11-14):** `runSearch` in `frontend/src/main.js` sends free-typed messages to `/chat` through `chatMessage` in `api.js`, and falls back to `/interpret` when `/chat` can't be reached. The `answer` table is not rendered yet; only its reply text is shown.
- **`/interpret` is unchanged.** `/chat` reuses its keyword rules. `/interpret` returns a list of actions and the requests to make; `/chat` returns one action with the data attached.
- **Slash commands work as messages:** `/quiz`, `/chart`, `/timestamp clipper`, `/model`.
- **3D model (2026-11-14):** "show me the 3D model" and "show the clipping step in 3D" return `action: model`. Example:
  ```json
  {"reply": "Opening the 3D model at step 3, clipping and cutting.", "action": "model", "data": {"case_id": "VID01", "step_key": "ClippingCutting", "step_label": "Clipping and cutting"}, "router": "rules"}
  ```
  The panel itself is frontend-only: see "3D model" in [frontend/README.md](../../frontend/README.md).
- **CORS** now allows `POST` from the default dev origins.

## Planned stage 3: video localization

Future overlay integration should expose frame timestamps, source dimensions, normalized boxes and provenance. The player must map into the actual video content rectangle and discard stale detections. The stage-3 payload is still proposed; existing endpoint documentation does not promise box or verb predictions.

See [Stage 3 localization plan](../../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
