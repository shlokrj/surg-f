# Video script: 3 minutes, Databricks track

Page: `/video-demo`, recorded full screen. Devpost limit: **3:00**. This video is for the Databricks sponsorship track, so more than half of it shows how we used Databricks, and it names each product on screen.

The voiceover is split across the four of us by topic. Record each part separately and lay it over the screen recording, or record it live in one take. **→** means press Right once (each scene plays in about 2.3 s).

| # | Segment | Voice | Time | On screen |
|---|---|---|---|---|
| 1 | Problem | Shlok | 0:00–0:25 | hero, 2 problem scenes |
| 2 | Solution | Mihir | 0:25–1:00 | 3 solution scenes |
| 3 | Databricks: storage, compute, tracking | Aadhitya | 1:00–1:50 | Volume, serverless jobs, MLflow |
| 4 | Databricks: data and serving | Rohan | 1:50–2:35 | Lakeflow and Delta; SQL, Genie and Llama |
| 5 | Live in the app, then close | Shlok | 2:35–3:00 | case page, Lil Doc answering through Genie |

About 400 spoken words. Leave a short pause at each **→** so the scene can play.

## Databricks products we name

Name each one while its scene is on screen. Judges are scoring how many we used and how well.

1. **Unity Catalog Volumes**: features, labels, models, predictions and videos.
2. **Serverless compute and Lakeflow Jobs**: extraction, training, the sweep, the final test, export, and the import job.
3. **MLflow**: every run, sweep setting and test score.
4. **Delta Lake** with **MERGE INTO**: one clip table, rebuilt without duplicates.
5. **Databricks SQL**: the warehouse behind search.
6. **Genie**: free-form questions over our quiz-facts view.
7. **Foundation Model APIs**: Llama 3.3 70B routes each chat message.

---

## 1. Problem: Shlok (0:00–0:25)

**On screen: the hero.**

> This is Surg+F: Ctrl+F for surgery.

**→ 17 seconds**

> A real gallbladder removal runs 28 minutes. The moment a student needs, the cystic duct being cut, lasts 17 seconds.

**→ Writing it down**

> And every step and instrument has to be documented by hand, which is slow and has to be exact.

## 2. Solution: Mihir (0:25–1:00)

**→ Ask in plain words**

> Surg+F labels every second of surgical video with instruments, actions and anatomy, so students can just ask: "When is the cystic duct cut?"

**→ Jump to the moment**

> The player jumps straight to 14:20.

**→ Practice in 3D**

> And because cadaver practice is expensive, each case comes with a 3D model of the anatomy that follows the video step by step.

## 3. Databricks: storage, compute, tracking: Aadhitya (1:00–1:50)

**→ Unity Catalog Volume**

> Everything behind that runs on Databricks. A Unity Catalog Volume holds SurgVLP features for all 50 CholecT50 surgeries, our 29-label file, every trained model, the predicted clips and the demo videos.

**→ Serverless jobs**

> Every heavy step is a Databricks job on serverless compute: feature extraction, training on 42 surgeries, a smoothing sweep, the final test on 4 held-out surgeries, and exporting predictions. Serverless started in under a minute, so nobody waited on a cluster.

**→ MLflow**

> MLflow tracks every run. We picked the smoothing setting on tuning surgeries before reading the test, and the demo model is run 9d18d20a, with a test F1 of 0.34 across all 29 labels.

## 4. Databricks: data and serving: Rohan (1:50–2:35)

**→ Lakeflow and Delta**

> A Lakeflow job stages each CSV from the Volume and MERGEs it into one Delta table: 11,264 surgeon-labeled clips and 1,658 model predictions. Rerunning it inserts nothing new.

**→ SQL, Genie and Llama**

> Search runs parameterized queries on a Databricks SQL warehouse. Chat goes to Llama 3.3 70B on the Foundation Model APIs, which picks a tool, and free-form questions go to a Genie space built on our quiz-facts view.

## 5. Live in the app, then close: Shlok (2:35–3:00)

**Click "Open a case". In the chat, ask: "Which instrument is used the longest?"** (Genie answers. Cut the wait in editing if the warehouse is slow.)

> Here it is live: Lil Doc hands the question to Genie, and the answer comes straight from our Delta tables.

> Surg+F: search, study and practice surgery, built on Databricks. Thanks for watching.

---

## Recording checklist

- Backend running in Databricks mode (`GET /health` shows `"mode":"databricks"`), with `DATABRICKS_CHAT_ENDPOINT` and `DATABRICKS_GENIE_SPACE_ID` set.
- Warm the SQL warehouse and Genie first: ask one question before you hit record.
- Decide whether footage is blurred (eye button, top right). Devpost viewers may prefer it blurred.
- Browser full screen, 1440×900 or larger, nothing else open on the screen.
- Keep it under 3:00. If it runs long, trim the pauses between scenes before cutting any Databricks lines.
