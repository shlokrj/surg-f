# Surgery practice upgrades: Easy and Hard mode

Status: proposal (2026-11-15, Rohan). Nothing here is built yet. It extends the shipped v1 described in [SURGERY_PRACTICE_PLAN.md](SURGERY_PRACTICE_PLAN.md) and the [README's Practice section](../README.md#practice-3d-surgery-practice).

## Why

Practice v1 works, but for the demo it is too forgiving and too abstract:

- Every tool works the same way: put it on a spot, then press and hold. There is no real decision in how a tool is used.
- Releasing a tool on the wrong tissue (for example, grasping the liver) quietly puts it back in the tray instead of counting as a mistake.
- The scene is a floating anatomy model, not an operation.
- The exercise stops after cutting the cystic duct, so the gallbladder is never removed.

The goal is a **Hard mode** that feels like an operation and has real stakes, while **Easy mode stays exactly as it is today**. The demo is close, so the scope is deliberately small: a handful of high-impact changes with a clear cut line, not an overhaul.

## Decisions

| Question | Decision |
|---|---|
| Modes | **Easy** is the current exercise. **Hard** contains every upgrade below. |
| Mistakes in Hard mode | **Strict:** any wrong action fails the stage. |
| View | **Hybrid:** an operating-room opening shot, then the inside-the-belly camera view surgeons actually work from. |
| Tool depth | Only the **two** most important additions, not a new control scheme for every tool. |

## 1. Easy and Hard mode

- Lil Doc's practice offer shows **Start (Easy)**, **Start (Hard)** and **Cancel**. A prompt that says "hard" (for example "practice clipping on hard") highlights Start (Hard).
- The mode is shown in the practice header and stays fixed for the session. Restart keeps the same mode; to switch, exit and ask Lil Doc again.
- **Easy:** today's behaviour, plus the two new final stages (section 3), which use the same place-and-hold mechanic.
- **Hard:** everything in sections 2 to 6.

## 2. Hard mode: strict mistakes

- **Every tissue contact counts.** If a tool is released on tissue that isn't an authored target for the stage (liver, duodenum, the wrong duct), that is a mistake, not a silent return to the tray. The feedback names what was touched, for example "You grasped the liver."
- Releasing a tool in empty space (not on tissue) still returns it with no penalty, so moving tools around is never punished.
- **Any mistake fails the stage.** A "Stage failed" banner names the error; the stage then resets (only that stage's changes are undone) and starts again. Wrong tool, wrong structure, wrong spot, a slanted clip and leaving the dissection line (section 4) are all failures.
- Failures are counted per stage and listed in the end-of-exercise recap.
- **Show guidance** stays available and still marks the stage as guided.

## 3. Remove the gallbladder: two new final stages (both modes)

The exercise grows from 4 to 6 stages, so it ends with the gallbladder out of the body. Each new stage is tied to an annotated VID01 moment, like the existing ones.

| # | Stage | Tool | Target | VID01 reference |
|---|---|---|---|---|
| 5 | Dissect the gallbladder off the liver | hook | the line where the gallbladder meets the liver | hook dissects gallbladder, 894–921 s |
| 6 | Bag the gallbladder and remove it through the navel port | grasper | the gallbladder, then the navel port | grasper grasps the specimen bag, 1658–1666 s (packing at 1512–1532 s) |

- **Easy:** place and hold, as today. The model then animates the gallbladder lifting off the liver (stage 5), going into the retrieval bag and out through the navel port (stage 6). These animations already exist in the study model and only need to be triggered from Practice.
- **Hard:**
  - Stage 5 uses the dissection trace (section 4b).
  - Stage 6: grasp the gallbladder, then drag it to the correct port, the navel (camera) port. Dragging it to any other port fails the stage.
- The exercise title and objective change from "clipping and cutting" to cover the whole removal. The content revision is bumped.

## 4. Tool depth: the two most important additions (Hard only)

These were chosen because each is a real decision a surgeon makes, not just a dexterity test.

### 4a. Aim the jaws (clip applier and scissors)

- After placing the clip applier or scissors on the duct, the resident sets the angle of the jaws: scroll wheel, Q / E keys, or a two-finger twist on touch.
- A faint guide line shows the duct's direction.
- The jaws must cross the duct within about **25°**. Firing at a worse angle fails the stage with an explanation, for example "The clip doesn't cross the whole duct, so it wouldn't close it."
- Why this one: a clip that doesn't fully cross the duct leaks. Getting the angle right is the key decision in clipping.

### 4b. Trace the dissection (hook)

- In stage 5, the resident holds to switch the hook on, then drags it along the line where the gallbladder meets the liver.
- A progress bar fills as the hook moves along the line.
- Leaving the safe corridor (about **0.4 cm** either side), toward the liver or toward the bile duct, fails the stage.
- Why this one: dissection is a continuous, controlled movement, and straying is how real injuries happen.

Everything else keeps today's mechanic: the grasper in stages 1 and 6, and the cut position for the scissors (only their angle is new).

## 5. Operating-room view (hybrid)

### Opening shot (about 3 seconds, skippable)

- The patient lies face-up on an operating table. This reuses the full-body outline already in the anatomy model (`body_outline`, 172 cm), so no new 3D assets are needed. The room is placed around the existing anatomy, so the anatomy itself never moves.
- It shows a simple table, drapes, an overhead light and the four port positions on the abdomen (`manifest.ports`), highlighted.
- The camera stands at the patient's left side, at a surgeon's eye height, looking at the abdomen.
- The camera then "goes in" through the navel port and flies into the inside view. A **Skip** button jumps straight there.

### Inside view (where the work happens)

- The camera looks from the navel port toward the gallbladder area, the way a real laparoscope does.
- A dark round "monitor" vignette and a slightly warmer light frame it as a camera feed.
- The body outline is hidden in this view.

### Stretch: room inset

- A small picture-in-picture of the room in the top-left corner, showing which port each instrument enters through.

## 6. Cleaner UI

- The tool tray looks like an instrument stand rather than a white panel.
- In Hard mode, hovering a structure no longer shows its name, because identifying the anatomy is part of the test.
- The corner marker of the 3D view shows **"✓ Passed"** or **"Stage failed"** in Hard mode.

## 7. Not in this round

Ideas worth keeping for later, deliberately left out to protect the demo timeline:

- A **critical view of safety** checkpoint before clipping: tap the two structures entering the gallbladder.
- Grasper **pull direction** (retracting the gallbladder the right way to open the working space).
- Visible consequences such as **bleeding** or a **bile leak**, with the bipolar and irrigator to deal with them.
- A **timer** and an efficiency score.
- **Saving progress** across sessions (needs a decision on accounts and privacy first).

## 8. Content caveat

The new stages, the Hard-mode rules, the angle tolerance and the corridor width are **draft content written by the software team** from the VID01 annotations. No clinician has reviewed them. The review gates in [SURGERY_PRACTICE_PLAN.md](SURGERY_PRACTICE_PLAN.md#medical-content-and-review-gates) still apply, and the exercise stays labelled as a draft.

## Build order and cut line

Each step ships on its own. If time runs short, stop at the cut line.

1. **Modes and strict failure** (sections 1–2).
2. **The two removal stages** (section 3), in both modes.
3. **Opening shot and inside-camera framing** (section 5, without the inset).
4. **Aim the jaws** (section 4a).
5. **Trace the dissection** (section 4b).

**Cut line:** the room inset (section 5 stretch) and the UI extras (section 6).

## Where the changes go

| Area | File | Change |
|---|---|---|
| Exercise content | `src/practice/exercises/cholecystectomy.clipping.v1.json` | Stages 5–6 and their target points (the liver-bed line from the `liverBed` and `gallbladderNeck` anchors, a port target); per-stage `hard` settings (`jaw_tolerance_deg`, `path`, `path_tolerance_cm`); new effects `detach` and `extract`; new content revision. |
| Rules | `src/practice/controller.js` | A session `mode`; a `contact` action (Hard: touching the wrong tissue fails the stage); a `failed` outcome that resets the stage; angle and path checks in Hard mode; failures per stage in the recap. |
| 3D interaction | `src/model/interaction.js` | Detect which tissue a tool is released on; jaw rotation for a placed tool; dissection tracing; dragging the gallbladder to a port. |
| 3D viewer | `src/model/viewer.js` | Trigger the existing lift, bag and port animations from Practice; the room (table, drapes, light) and camera fly-in. |
| Panel and entry | `src/practice/workspace.js`, `src/main.js`, `src/lildoc.js`, `src/practice/catalog.js` | Mode badge, failed banner, recap failures, Skip on the opening shot; Easy / Hard start buttons; "hard" in the prompt. |
| Styles | `src/practice/practice.css` | Monitor vignette, instrument-stand tray, failed banner. |

## How it will be checked

- **Unit tests** (`test/practice.test.js`):
  - In Hard mode, touching the wrong tissue fails the stage; a jaw angle outside the tolerance fails and one inside passes; leaving the dissection line fails.
  - Easy mode behaves exactly as before.
  - The new stages pass the exercise checks, including that each reference moment lies inside a VID01 annotation for that instrument.
- **Browser walkthrough** (headless Chrome):
  - All existing Easy-mode checks still pass.
  - New Hard-mode checks: grasping the liver fails stage 1 with a banner; a slanted clip fails and a straight one passes; the hook trace fails off the line and passes on it; dragging the gallbladder to the wrong port fails and to the navel port passes.
  - The opening shot plays and Skip works; both modes reach the recap with six stages.
- Production build, plus screenshots of the opening shot and the inside view for a visual check.
