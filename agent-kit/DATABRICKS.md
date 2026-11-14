# Databricks setup and demo

1. Create one Unity Catalog Delta table for clip intervals. Use the fields in CONTRACTS.md. Commit the SQL source under databricks/ and record the deployed catalog.schema.table in progress.
2. Load two fixture rows. Run a parameterized label query through the backend and check the response. Keep warehouse credentials in backend environment variables.
3. Load verified annotation rows and check the jump against actual playback. Store the video wherever the demo player can access it.
4. Wrap the import and interval generation in an on-demand Lakeflow job. Verify that rerunning it does not duplicate clips.
5. Train the tool-presence classifier in a Databricks notebook on the feature bundles in `/Volumes/workspace/default/surgf/features/`, and log params, metrics, and the model in MLflow. SurgVLP extraction runs outside Databricks because it needs a GPU.
6. Log how often a correct clip appears in the top three results in MLflow. Try a Delta Sync AI Search index only once the SQL path works.
