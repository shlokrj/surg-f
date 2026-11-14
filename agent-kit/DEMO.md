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
