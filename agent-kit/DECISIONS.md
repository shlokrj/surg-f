# Project decisions

| Decision | Reason |
|---|---|
| Shared GitHub repo for source and docs | All four coding agents can use the same contracts and review changes. |
| Databricks SQL and Delta power live search | One searchable clip table connects ingestion to the demo. |
| Dataset annotations provide the first demo path | Frontend and backend can integrate while SurgVLP features are extracted. |
| Frozen SurgVLP with a small classifier first | Cached features let the team train and iterate without repeatedly running the backbone. |
| 2026-11-14: Team Databricks target is Aadhitya's workspace, catalog `workspace`, schema `default`, so the clip table is `workspace.default.surgf_clips` | One shared warehouse that every teammate's `.env` already points at. Avoids duplicate tables. |
| 2026-11-14: Train the tool-presence classifier in Databricks and track runs in MLflow. SurgVLP feature extraction stays off Databricks. Features go to the `workspace.default.surgf` Volume | The classifier on cached features is CPU-sized. MLflow gives reproducible runs and uses the sponsor platform. Extraction needs a GPU, which the workspace lacks. |
| 2026-11-14: Shlok selected Databricks GPU for SurgVLP extraction, superseding the earlier off-Databricks extraction decision | Keep full extraction and feature handoff in the team workspace. Local CPU checks validate the code first; cluster availability, credentials, CUDA execution, and Volume upload remain pending. |
| 2026-11-14: Shlok approved Databricks serverless CPU for the first demo cases and CPU classifier training | Classic GPU provisioning is blocked and serverless GPU did not execute. A real CPU smoke and full VID01 extraction succeeded. Keep all full extraction on Databricks; revisit GPU for larger workloads. |
| 2026-11-14: Use the dataset label `clipper` everywhere, including the fixture, SQL checks, contracts, backend tests, and search queries. Drop `clip applier` | The data, backend search, and frontend suggestions already use `clipper`. One name avoids empty searches. |

Append dated decisions here when a change affects another lane. Record the reason and update affected contracts in the same change.

## Planned stage 3: video localization

2026-11-14: Shlok requested a third-stage localization roadmap and a toggleable overlay experience. Grounding DINO-T is the recommended first experiment, with optional SAM 2.1 tracking/segmentation later. This is a research recommendation, not a validated model selection. The taxonomy audit and explicit proposed interfaces are recorded in the plan.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
