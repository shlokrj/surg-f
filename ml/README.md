# SurgVLP feature extraction

Shlok owns this pipeline; Aadhitya owns videos. See [progress](PROGRESS.md) for evidence and blockers. Commit and push to `ml-dev`; update `main` only when Shlok requests it.

## Databricks GPU run

Shlok selected Databricks GPU on 2026-11-14. No cluster has been launched or Volume upload verified by this pipeline yet.

1. Open this repository as a Databricks Git folder on `ml-dev` and pull its latest changes.
2. Attach `extract_databricks.py` to GPU ML compute with Dedicated access and permission to use `workspace.default.surgf`. The team's documented candidate is a single-node `g4dn.xlarge` with 30-minute auto-termination; availability and quota still need verification. Use a runtime with PyTorch >= 2.6 and its matching torchvision. Keep the runtime's CUDA packages rather than installing the Mac's CPU setup.
3. Run the notebook with `case_id=VID01`, `full_case=false`. It downloads labels and the official checkpoint to `/local_disk0/surgf-assets`, then only 16 frames. It checks CUDA, Volume access, feature shape, hashes, and annotation alignment.
4. After the smoke check succeeds, set `full_case=true` and rerun from the widget cell. This downloads only VID01, extracts all 1,734 frames, and publishes to `/Volumes/workspace/default/surgf/features/VID01/`. It reloads and validates the uploaded files before reporting success. Existing complete bundles are validated and preserved; incomplete or incompatible destinations require review, not automatic replacement.
5. Record the actual cluster/runtime, result, and destination in `PROGRESS.md`. Process another case separately. Stop compute when finished.

The notebook uses the attached Databricks identity; it needs no token in source. Local workspace authentication is now verified using the existing team token (Aadhitya's identity). The SQL warehouse HTTP path alone cannot launch GPU extraction.

To check the local setup again:

```sh
source ~/madhacks2026/.venv-surgf/bin/activate
pip install databricks-sdk python-dotenv
python scripts/check_databricks_auth.py
```

The script loads the Git-ignored repo-root `.env`: `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH` (for SQL), and `DATABRICKS_TOKEN`. It also accepts `DATABRICKS_HOST` as a full HTTPS workspace URL. Keep `.env` owner-readable/writable only (`chmod 600 .env`). The SDK does not load `.env` automatically; this script loads it explicitly. It checks the token identity, Volume metadata, and visible cluster count without starting compute. See the [official SDK authentication guide](https://docs.databricks.com/aws/en/dev-tools/sdk-python).

## Local setup and smoke check

Use Python 3.10-3.12. This Mac was tested with Python 3.12, PyTorch 2.6.0, torchvision 0.21.0, NumPy 1.26.4, Pillow 11.3.0, and ijson 3.6.0.

```sh
python3.12 -m venv ~/madhacks2026/.venv-surgf
source ~/madhacks2026/.venv-surgf/bin/activate
pip install torch==2.6.0 torchvision==0.21.0
pip install -r ml/requirements.txt
python ml/prepare_assets.py ~/madhacks2026/assets
python ml/download_case.py ~/madhacks2026/assets/samples.json VID01 ~/madhacks2026/frames 674 690
python ml/extract_features.py extract \
  --samples ~/madhacks2026/assets/samples.json --case-id VID01 \
  --frames-dir ~/madhacks2026/frames/VID01 \
  --checkpoint ~/madhacks2026/assets/SurgVLP.pth \
  --output ~/madhacks2026/features-smoke/VID01 \
  --start 674 --end 690 --batch-size 4 --device cpu
python ml/extract_features.py validate ~/madhacks2026/features-smoke/VID01 \
  --samples ~/madhacks2026/assets/samples.json
python -m unittest discover -s ml -p 'test_*.py' -v
```

Use a new output directory on each extraction; existing outputs are never overwritten. The smoke output is a partial case, and `validate --require-complete` deliberately rejects it for publication. Download all frames and omit `--start`/`--end` for a full case. The extractor also supports `--device cuda` and `--device mps`, but only CPU execution has been verified locally.

Current files on Shlok's Mac are outside Git: labels and frames in `~/madhacks2026/data/cholect50/`, weights in `~/madhacks2026/models/`, and smoke output in `~/madhacks2026/features-smoke/VID01/`. The setup above uses a consolidated assets folder for new environments.

## Model and bundle contract

The image branch matches [official SurgVLP source](https://github.com/CAMMA-public/SurgVLP/tree/85e858998eec47614614b89f6af1363e0ad3f47b): ResNet-50 followed by its learned 2,048-to-768 projection. Strict loading requires every image weight from the official checkpoint. No random or ImageNet fallback is used. The text encoder is unnecessary for frozen image features, so this implementation avoids the upstream package's old tokenizer/build dependencies. It is not a text-query encoder.

Preprocessing is RGB, resize to 360x640, center crop 224, tensor conversion, and ImageNet mean/std normalization. Features are raw projected float32 vectors without L2 normalization, matching the upstream `img_norm=False` setting. Official preprocessing and image encoder output were compared exactly on VID01 frame 680 using the downloaded checkpoint.

Each bundle contains:

- `features.npy`: `[frames,768]` float32 matrix.
- `manifest.csv`: exactly `case_id,frame_id`, sorted in feature-row order.
- `annotations.json`: instrument labels in the same row order; missing annotations stay `null` rather than becoming negatives.
- `metadata.json`: checkpoint and input hashes, model source revision, preprocessing, versions, device, completeness, and output checksums.

The first two files preserve the [shared contract](../agent-kit/CONTRACTS.md); the other files record provenance and label alignment. Validation checks nonfinite/zero features, shape, duplicate or incorrect IDs, source label joins, checksums, and full-case coverage. `publish_features.py` requires complete cases, refuses existing destinations, writes metadata last, and validates readback. Readers should validate a bundle before using it, not infer success from directory presence. No frames are deleted automatically.

Upstream checkpoint SHA-256: `4db3eb9dc53aa46f69a8adaeffa115fa75c9a15c08e60638011b812a6b128b3d`. Asset preparation checks this and the verified labels hash; changed upstream assets stop the run for review.

Databricks references: [ML runtime and Dedicated access](https://docs.databricks.com/aws/en/machine-learning/databricks-runtime-ml), [Unity Catalog Volumes](https://docs.databricks.com/aws/en/volumes).
