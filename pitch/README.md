# Pitch: MadHacks 2026

How we show Surg+F at the hackathon. There are two deliverables, a 5-minute in-person presentation and a 3-minute Devpost video for the Databricks track. Each has its own version of the homepage and its own script.

| Version | URL | Use | Script |
|---|---|---|---|
| Product | `/` | The product site. Not used for judging. | None |
| Demo | `/demo` | The original presentation version, kept as it was. | None |
| Presentation demo | `/presentation-demo` | The 5-minute in-person pitch, four speakers | [presentation-demo-script.md](presentation-demo-script.md) |
| Video demo | `/video-demo` | The 3-minute Devpost video, focused on the solution and Databricks | [video-demo-script.md](video-demo-script.md) |

Locally, add the path to the dev server URL, for example `http://localhost:5173/presentation-demo`. `?mode=presentation-demo` or `?mode=video-demo` on any URL does the same, which also works on a host that does not serve `index.html` for unknown paths. The versions are defined in `VERSIONS` in [frontend/src/home.js](../frontend/src/home.js).

## What each demo shows

**Presentation demo:**

1. Problem, 4 scenes: 17 seconds in a half-hour video; writing it all down; learning is costly (cited: ACGME 2024, Shin 2021, Ashrafi 2026, van der Leun 2024); who needs it.
2. Solution, 5 scenes: label every second; ask in plain words; jump to the moment; the labels are the record; practice in 3D.
3. The stack: the block, then 6 layers, built up from the surgery video to the player.
4. Model, 4 scenes: held-out test; instruments; label model: v1 to v2; box detectors.
5. Databricks, 6 scenes: Volume; serverless jobs; MLflow; Lakeflow and Delta; SQL, Genie and Llama; Databricks Apps.
6. What's next, 4 scenes: Lil Counsel, Lil Ledger, Lil Watch, Lil Pal.

**Video demo** (faster pace):

1. Problem, 2 scenes: 17 seconds in a 29-minute video; learning surgery is slow and expensive (cited: ACGME 2024, Shin 2021, Ashrafi 2026, van der Leun 2024).
2. Solution, 3 scenes: ask; jump; practice in 3D.
3. Databricks, all 6 scenes.

## Driving the page

- **Scroll** at an easy pace. Each scene plays as you scroll through it and holds once it has played, so pause where you want to talk. Scrolling back plays it in reverse.
- **Chapter names** on the right jump straight to a chapter.
- **Left and right arrow keys** step to the previous or next scene, scrolling slowly so each animation plays out. A press during a step queues the next one. Scrolling or clicking takes back control. The page does not mention this.
- **Eye button** (top right): blurs or shows every surgery frame on the page. It starts blurred. Click it once before you present if the room is fine with surgical footage.

## Before you present or record

1. `git pull`, then start the backend and the frontend (see [frontend/README.md](../frontend/README.md#run)). The 3D captures and frame animations need `frontend/public/videos/VID01.mp4`: run `python scripts/fetch_videos.py VID01` from the repo root.
2. Open the version in a full-screen browser window at 1440×900 or larger. Smaller windows still work but scale the scenes down.
3. Scroll once all the way through to warm the frame cache (the real VID01 frames load the first time each scene appears), then reload the page.
4. Decide on the eye button.
5. For the live part of the video, check that `/chat` reaches Genie (the backend log shows `router=genie`). A cold SQL warehouse can take a minute to wake up.

## Facts used in the scripts

Every number in the scripts is on the site and traced to the repo. Do not round them differently out loud.

| Fact | Value | Source |
|---|---|---|
| VID01 length | 28:53 (1,733 s) | the video file |
| The cystic duct cut | 14:20 to 14:37, 17 s | `shared/triplets.annotation.csv` |
| Dataset | CholecT50, 50 laparoscopic gallbladder removals | CholecT50 |
| Surgeon-labeled clips in our index | 11,264 | `agent-kit/PROGRESS.md`, `ml/PROGRESS.md` |
| Model-predicted clips in our index | 1,658, from model `9d18d20a` on the 4 test surgeries | `ml/PROGRESS.md` |
| Labels | 29: 6 instruments, 9 actions, 14 targets | `frontend/public/model-evals.md` |
| Split | 42 trained on, 3 tuned on, 4 tested on | same |
| Test F1 | average 0.34; grasper 0.89, hook 0.83; scissors 0.07 → 0.29 from v1 to v2 | same |
| Frame features | SurgVLP, frozen ResNet-50, 768 numbers per second | `ml/README.md` |
| Boxes | Faster R-CNN on Endoscapes; gallbladder precision and recall 0.93; cystic duct recall 0.39; instruments (any type) precision 0.89, recall 0.83, named from surgeon labels when only one is listed | `frontend/src/modelnotes.js`, the eval docs |
| Residency case minimum | 850 major operations over five years | ACGME defined-category minimums, 2024 |
| Teaching time | Laparoscopic cholecystectomy about 37% longer with a resident operating (IRR 1.37; 344 cases, 2018 to 2019) | Shin et al., Surg Endosc 2021 |
| Operating-room cost | $57.71 per minute (California hospitals, FY 2022) | Ashrafi et al., JAMA Surg 2026 |
| Video use | 98.6% of residents (71 of 72) prepare with video, mostly YouTube | van der Leun et al., Eur Urol Open Sci 2024 |
| Databricks run log | Volume `/Volumes/workspace/default/surgf`; Lakeflow job `surgf-import-clips` (stage, then MERGE; a rerun inserts 0); smoothing sweep picked 2 s : 2 s; Llama route 2.0 s; Genie answer 11.7 s | `agent-kit/DATABRICKS.md`, `ml/PROGRESS.md` |

## Citations

Every version ends with a **Sources** section listing the papers, datasets and tools we used, with BibTeX. If a judge asks about data licences: CholecT50, Cholec80 and Endoscapes are CC BY-NC-SA 4.0 (non-commercial), and BodyParts3D is CC BY 4.0. For CholecT50 we cite the Rendezvous paper, as the dataset's authors ask; the citation on the Hugging Face card points to the wrong arXiv paper.

## Things to say carefully

- **The 3D model is an illustration.** It is a generic body (BodyParts3D) that follows the video's steps; the clips, cut and triangle are schematic and not yet medically reviewed. Say "practice the anatomy" or "rehearse each step", not "practice the surgery".
- **"The labels are the record"** shows that our labels hold what a record needs. Surg+F does not write clinical notes yet.
- **Your own video** opens for playback today. Search and the model's labels cover the indexed demo cases; indexing uploads is next.
- **What's next agents** are concepts. The page says they are not built yet.
- **Databricks Apps:** the page says Surg+F is hosted on Databricks Apps. Deploy it before you present or record, and share the app link with judges.
- **Cadaver cost and documentation time:** these are our framing from research. We do not show a number for either, so do not quote one unless you have a source to point to.
