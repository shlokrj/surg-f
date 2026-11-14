# Role playbooks

| Lane | Repo path | First check | Handoff |
|---|---|---|---|
| Databricks | databricks/ | Query one verified clip from Delta | Full table name and sample SQL |
| Backend | backend/ | Return a clip from /search with all shared fields | Example request and response |
| Frontend | frontend/ | Click a result, switch cases, and seek to its start time | Reproducible playback demo |
| Data and ML | ml/ | Reload a small real SurgVLP batch and join each row to its label | Case IDs, feature bundles, and verified annotation times |

Use an explicitly labeled fixture while dependencies are being built. Verify each handoff with a real case before marking it complete. Keep credentials, raw footage, and large feature caches out of Git.

## Planned stage 3: video localization

When stage 3 starts: ML validates localization and action association, data validates source coordinates/timebase, backend validates versioned overlay responses, and frontend validates toggle/rendering behavior. Use the central plan for the proposed responsibility split; no new model or service is running yet.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
