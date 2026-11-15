# Surg+F agent kit

Start with [AGENTS.md](AGENTS.md) for Git and collaboration rules. Use [SPEC.md](SPEC.md) for the MVP and shared interfaces, [SKILLS.md](SKILLS.md) for role-specific checks, and [PROGRESS.md](PROGRESS.md) for owners, blockers, and handoffs.

- [Shared interfaces](CONTRACTS.md) defines the search response, playback timestamps, and ML handoff.
- [Team handoffs](HANDOFFS.md) has a prompt template for every teammate's agent.
- [Databricks setup](DATABRICKS.md) walks through live search and the sponsor features.
- [Evaluation and judging](EVALUATION.md) covers integration checks, metrics, and demo order.
- [Project decisions](DECISIONS.md) records choices that affect multiple lanes.

- [ML team progress](../ml/PROGRESS.md) separates Shlok's feature extraction from Aadhitya's video work.

## Stage 3: video localization (experimental)

**Status (2026-11-15): live and experimental.** VID01 shows anatomy boxes (gallbladder, cystic duct) every 0.24 s from a Faster R-CNN trained on Endoscapes (v3, native resolution; validation AP 0.384). No instrument or liver boxes, no tracking, no action links. VID01 accuracy itself is unmeasured (review deferred). The plan records the model history (Grounding DINO prototype → Endoscapes Faster R-CNN), data, evaluation, Databricks jobs and open gaps.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
