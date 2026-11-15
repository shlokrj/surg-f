# Presentation script: 5 minutes, 4 speakers

Page: `/presentation-demo`. One person scrolls for the whole talk (the speaker, or a teammate beside the laptop). **→** means scroll on to the next scene and let it play; each scene holds once it has played, so talk over it and move on when you finish the line.

Speaker assignments follow who built each part (see `agent-kit/PROGRESS.md`). Swap names freely; the segments stand on their own.

| # | Segment | Speaker | Time | Scenes |
|---|---|---|---|---|
| 1 | Hook and problem | Shlok | 0:00–1:05 | hero, 3 problem scenes |
| 2 | Solution and features | Mihir | 1:05–2:25 | 5 solution scenes, 3 feature cards |
| 3 | How it works | Rohan | 2:25–3:20 | the block, 6 stack layers |
| 4 | Model and Databricks | Aadhitya | 3:20–4:40 | 4 model scenes, 6 Databricks scenes |
| 5 | What's next and close | Shlok | 4:40–5:00 | 4 future scenes |

About 690 spoken words at roughly 140 words a minute. If you run long, cut the lines marked *(optional)*.

---

## 1. Hook and problem: Shlok (0:00–1:05)

**On screen: the hero, "surg + f".**

> Hi, we're Surg+F. Think Ctrl+F, but for surgery: you type what you're looking for, and the video jumps to it.

**→ 17 seconds** (the scrubber hunts, then lands on 14:20)

> This is VID01, a real gallbladder removal from the CholecT50 dataset. It runs 28 minutes 53 seconds. The moment a student usually needs, the cystic duct being cut, starts at 14:20 and is over 17 seconds later. That's about 1% of the video. Without an index, you scrub back and forth until you find it.

**→ Writing it down** (an operative record fills in by hand)

> And someone has to write all of this down. Every operation is documented: each step, the instruments, and when. Done by hand, it's slow, it has to be exact, and gaps in the record turn into delays and billing questions.

**→ Who needs it** (four people, each tied to a real moment)

> We started out building general search for long surgical videos. Then we dug into who needs it most: surgical students and residents. A resident wants to watch the duct being clipped before doing it. Educators need to cut the critical seconds into a lesson. *(optional)* Surgeons review steps before a case, and researchers compare technique across operations.

---

## 2. Solution and features: Mihir (1:05–2:25)

**→ Label every second** (a read head sweeps the video and label lanes fill in)

> Surg+F turns surgical video into something you can study. A model trained on 42 surgeries reads every second and predicts 29 labels: instruments, actions and anatomy.

**→ Ask in plain words** (the question types itself; "cut" maps to scissors)

> Then you just ask. "When is the cystic duct cut?" becomes a search for the scissors, across every labeled and predicted clip.

**→ Jump to the moment** (the knob flies to 14:20)

> Pick the result, and the player lands on 14:20. One question, one jump.

**→ The labels are the record** (the same record, filled at once)

> Those same labels already hold what the record needs: every step, every instrument, every time. For VID01 it fills in at once. Writing clinical notes from it is our next step.

**→ Practice in 3D** (the 3D model moves through three steps)

> Practice on cadavers is expensive and hard to get. So each case has a 3D model of the gallbladder region that follows the video step by step. Residents can rotate it and fade organs away to see what the surgeon is working around.

**→ → → the three feature cards** (step timeline, instrument chart, quiz)

> For studying, every case is split into its surgical steps, with a chart of how long each instrument is on screen, and a quiz on step order and instruments. Our assistant, Lil Doc, answers questions about the video in plain words. *(optional)* Students can also open their own recordings for playback.

---

## 3. How it works: Rohan (2:25–3:20)

**→ The block** (it splits into six layers)

> Here's what's underneath. Surg+F is six layers, from the player down to the surgery video.

**→ The player**

> The player is a plain JavaScript app. An experimental detector draws boxes over the video.

**→ Search and chat**

> Questions go to our FastAPI backend. Search runs on Databricks SQL, a Llama 3.3 70B model routes chat messages, and Databricks Genie answers free-form questions.

**→ Clip index**

> Every surgeon label and model prediction is one row in a Delta table: case, start, end, label and source.

**→ Label model**

> A scikit-learn neural network predicts all 29 labels at once from five seconds of features.

**→ Frame features**

> Those features come from SurgVLP, a model pretrained on surgical video lectures, which turns each second into 768 numbers.

**→ Surgery video**

> And at the bottom, the CholecT50 surgeries themselves, labeled second by second by surgeons.

---

## 4. Model and Databricks: Aadhitya (3:20–4:40)

**→ Held-out test** (49 tiles sort into 42, 3 and 4)

> We kept the evaluation honest: trained on 42 surgeries, tuned on 3, and tested on 4 the model never saw.

**→ Instruments**

> Grasper and hook score 0.89 and 0.83 F1. Rare tools like scissors are harder.

**→ Label model: v1 to v2**

> Going from 12 to 42 training surgeries lifted scissors from 0.07 to 0.29.

**→ Box detector (v3)**

> A second model draws boxes. The gallbladder is found reliably; the small cystic duct is often missed, and we say so in the app.

**→ Unity Catalog Volume** (folders open; 50 bundles fill in)

> All of it runs on Databricks. One Unity Catalog Volume holds features for all 50 surgeries, our labels, models, predictions and videos.

**→ Serverless jobs**

> Feature extraction, training, the smoothing sweep, the final test and export each ran as a serverless job.

**→ MLflow**

> Every run is logged in MLflow. Smoothing was chosen on the tuning surgeries before we ever read the test.

**→ Lakeflow and Delta**

> A Lakeflow job MERGEs clips into one Delta table, 11,264 surgeon labels and 1,658 predictions, and rerunning it never duplicates a row.

**→ SQL, Genie and Llama**

> And search and chat run on Databricks SQL, Genie and the Foundation Model APIs.

**→ Databricks Apps** (marked "Planned")

> Next, we're moving the whole app onto Databricks Apps, so it runs inside the workspace with its own service principal and no personal tokens.

---

## 5. What's next and close: Shlok (4:40–5:00)

**→ Lil Counsel → Lil Ledger → Lil Watch → Lil Pal** (scroll through; they reveal beside Lil Doc)

> Lil Doc teaches today. Next, the same index can serve everyone around an operation: a legal review, billing, quality and safety, and the patient.

> That's Surg+F. Thank you, and we'd love your questions.

---

## If something goes wrong

- **A scene shows a gradient instead of real frames:** the video did not load. Keep talking; the scenes still make sense.
- **You scrolled too far:** scroll back, or click the chapter name on the right.
- **Live question from a judge:** click **Open a case** (top right), ask Lil Doc, or enter `/model` to open the 3D view.
