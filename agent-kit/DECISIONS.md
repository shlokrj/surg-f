# Project decisions

| Decision | Reason |
|---|---|
| Shared GitHub repo for source and docs | All four coding agents can use the same contracts and review changes. |
| Databricks SQL and Delta power live search | One searchable clip table connects ingestion to the demo. |
| Dataset annotations provide the first demo path | Frontend and backend can integrate while SurgVLP features are extracted. |
| Frozen SurgVLP with a small classifier first | Cached features let the team train and iterate without repeatedly running the backbone. |
| 2026-11-14: Team Databricks target is Aadhitya's workspace, catalog `workspace`, schema `default`, so the clip table is `workspace.default.surgf_clips` | One shared warehouse that every teammate's `.env` already points at. Avoids duplicate tables. |

Append dated decisions here when a change affects another lane. Record the reason and update affected contracts in the same change.
