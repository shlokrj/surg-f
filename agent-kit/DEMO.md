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

## Planned stage 3: video localization

The requested third-stage overlay demo is future work. Eventually show the toggle, synchronized labels/boxes, case switching and missing-data behavior on a verified clip. The supplied prostatectomy screenshot is visual inspiration, not a verified Surg+F result. Keep planned overlays separate from demonstrations of working features.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
