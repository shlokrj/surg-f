import tripletCsv from '../../shared/triplets.annotation.csv?raw';
import fixture from '../../shared/search.fixture.json';
import timeline01 from '../../backend/fixtures/timeline.VID01.json';
import timeline02 from '../../backend/fixtures/timeline.VID02.json';
import quizFixture from '../../backend/fixtures/quiz.seed-1.json';
import steps01 from '../../backend/fixtures/steps.VID01.json';
import steps02 from '../../backend/fixtures/steps.VID02.json';

const backendUrl = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const fixtureMode = import.meta.env.VITE_USE_FIXTURE === 'true';

async function getJson(path) {
  const response = await fetch(`${backendUrl}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function tripletRows() {
  return tripletCsv.trim().split(/\r?\n/).slice(1).map(line => {
    const [id, start, end, instrument, verb, target, source] = line.split(',');
    return { case_id: id, start_sec: Number(start), end_sec: Number(end), instrument, verb, target, source };
  });
}
export async function searchClips(query) {
  if (fixtureMode) {
    // Fixture mode still answers instrument searches for the hosted demo cases from the verified
    // annotation intervals bundled in shared/triplets.annotation.csv (one hit per interval).
    const label = query.toLowerCase().trim();
    const seen = new Set();
    const annotated = tripletRows().filter(row => row.instrument === label).filter(row => {
      const key = `${row.case_id}:${row.start_sec}:${row.end_sec}`;
      return !seen.has(key) && seen.add(key);
    }).map(row => ({ case_id: row.case_id, start_sec: row.start_sec, end_sec: row.end_sec, label: row.instrument, source: row.source }));
    return [...fixture.results.filter(result => result.label.toLowerCase() === label), ...annotated];
  }
  const data = await getJson(`/search?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(data.results)) throw new Error('Invalid search response');
  return data.results;
}
export async function getTimeline(caseId) {
  if (fixtureMode) return caseId === 'VID01' ? timeline01 : caseId === 'VID02' ? timeline02 : { case_id: caseId, source: 'annotation', segments: [], summary: [] };
  return getJson(`/cases/${encodeURIComponent(caseId)}/timeline`);
}
export async function getQuiz() {
  if (fixtureMode) return { ...quizFixture, demo: true };
  try { return await getJson('/quiz'); }
  catch (error) {
    if (error instanceof TypeError || error.status === 404) return { ...quizFixture, demo: true };
    throw error;
  }
}
// Steps of the operation for one video (the default timeline). The saved copies are used in
// fixture mode and when the backend cannot be reached, so the timeline always has steps.
export async function getSteps(caseId) {
  const saved = { VID01: steps01, VID02: steps02 }[caseId] ?? null;
  if (fixtureMode) return saved;
  try { return await getJson(`/cases/${encodeURIComponent(caseId)}/steps`); }
  catch (error) {
    if (saved && (error instanceof TypeError || error.status === 404)) return saved;
    throw error;
  }
}
// Ask the backend what the typed text means. Returns null in fixture mode, so the caller
// falls back to its local rules. See backend/docs/FRONTEND_GUIDE.md (Interpret).
export async function interpretQuery(query, caseId) {
  if (fixtureMode) return null;
  return getJson(`/interpret?q=${encodeURIComponent(query)}&case_id=${encodeURIComponent(caseId)}`);
}
// Send one free-typed chat message. The backend picks the feature and returns
// { reply, action, data, router } in one call. Returns null in fixture mode, so the caller
// falls back to /interpret and its local rules. See backend/docs/FRONTEND_GUIDE.md (Chat).
export async function chatMessage(message, caseId, durationSec = 0) {
  if (fixtureMode) return null;
  const body = { message, case_id: caseId };
  if (durationSec > 0) body.video_duration_sec = durationSec;
  const response = await fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
  return response.json();
}
export { fixtureMode, backendUrl };
export const instrumentLabels = ['clipper', 'hook', 'grasper', 'irrigator', 'bipolar', 'scissors'];

// Verified CholecT50 annotation intervals supplied by Data/ML for VID01 and VID02.
export function getActionRows(caseId) {
  return tripletRows().filter(row => row.case_id === caseId);
}
