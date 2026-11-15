# Demo checks

1. Pick one real tool label and write down the case ID and a second inside the matching clip.
2. Save the API response for that search to a JSON file. Check the first three results:

   ```sh
   python3 scripts/check_search.py response.json --case CASE_ID --second 42
   ```

   Replace the case and second with the verified values. Use the fixture to check the script before the API is ready:

   ```sh
   python3 scripts/check_search.py shared/search.fixture.json --case fixture_01 --second 30 --source fixture
   ```

3. Click the matching result. Confirm the player opens the right case and seeks to the clip start. Repeat with a result from another case.
4. Try a query with no matching clips and check the empty state. If predictions are available, repeat the same query with prediction results and pass `--source prediction`.

## Stage 3: anatomy overlays (experimental)

1. Open VID01, turn on **Bounding boxes** and play: gallbladder and cystic duct boxes follow the video (sampled every 0.24 s, each box expires after 0.25 s). The Instruments filter is disabled because there are no instrument boxes.
2. Seek to 11:14 (674 s): gallbladder and cystic duct boxes. Use **Sampled frame** to jump between detection frames while paused, and the score slider to hide low scores.
3. Click **Fullscreen with overlays**; switch to VID02 and confirm boxes disappear (no artifact for VID02).
4. Say what it is: a Faster R-CNN trained on Endoscapes (v3, validation AP 0.384; gallbladder about 0.93 precision and recall, cystic duct weaker), experimental and not validated on this video. It misses the duct at 11:38. Do not present boxes as ground truth.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
