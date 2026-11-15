# Role playbooks

| Lane | Repo path | First check | Handoff |
|---|---|---|---|
| Databricks | databricks/ | Query one verified clip from Delta | Full table name and sample SQL |
| Backend | backend/ | Return a clip from /search with all shared fields | Example request and response |
| Frontend | frontend/ | Click a result, switch cases, and seek to its start time | Reproducible playback demo |
| Data and ML | ml/ | Reload a small real SurgVLP batch and join each row to its label | Case IDs, feature bundles, and verified annotation times |

Use an explicitly labeled fixture while dependencies are being built. Verify each handoff with a real case before marking it complete. Keep credentials, raw footage, and large feature caches out of Git.

## Stage 3: video localization

Spatial (Mihir, `ml/localization/`): before changing the VID01 overlay, compare models with `analyze_anatomy_errors.py` on the Endoscapes validation split, export with `export_anatomy_video.py` (player seconds, not dataset frame IDs), validate with `artifact.py`, and check boxes in a real browser (seek, playback, resize, fullscreen, case switch). Backend and Databricks tables are not involved; overlays are static files.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
