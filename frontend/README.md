# Surg+F frontend

Two-page video chooser and search/playback dashboard based on Mihir's Claude Design prototype. Search calls the shared `GET /search?q=...` API. Selecting a result switches to its `case_id` video and seeks to `start_sec`.

## Run

```sh
cd frontend
npm install
npm run dev
```

Set `VITE_BACKEND_URL` to the API origin (default `http://localhost:8000`). For local development without the backend, set `VITE_USE_FIXTURE=true` in `frontend/.env.local`; this reads `shared/search.fixture.json`. Switch to the real API by changing that environment variable.

Put playable assets at `frontend/public/videos/VID01.mp4`, etc., or set `VITE_VIDEO_BASE_URL` to a URL containing the same filenames. The case manifest maps `VID01` and `VID02`; the data owner must supply or host the assets. Video files are excluded from Git. A local upload plays in the browser but does not ingest or annotate the video.

The chat-shaped panel currently performs annotated label search. General Q&A, counts, persistent chat history, arbitrary upload processing, and bleeding detection need backend support and are not claimed by this build.

## Integration check

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with a second case and a no-match query. Run `npm run build` for a production build.
