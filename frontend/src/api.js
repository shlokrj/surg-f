import tripletCsv from '../../shared/triplets.annotation.csv?raw';
import fixture from '../../shared/search.fixture.json';
import timeline01 from '../../backend/fixtures/timeline.VID01.json';
import timeline02 from '../../backend/fixtures/timeline.VID02.json';
import quizFixture from '../../backend/fixtures/quiz.seed-1.json';

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
export async function searchClips(query) {
  if (fixtureMode) return fixture.results.filter(result => result.label.toLowerCase() === query.toLowerCase().trim());
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
// Ask the backend what the typed text means. Returns null in fixture mode, so the caller
// falls back to its local rules. See backend/docs/FRONTEND_GUIDE.md (Interpret).
export async function interpretQuery(query, caseId) {
  if (fixtureMode) return null;
  return getJson(`/interpret?q=${encodeURIComponent(query)}&case_id=${encodeURIComponent(caseId)}`);
}
export { fixtureMode, backendUrl };
export const instrumentLabels = ['clipper', 'hook', 'grasper', 'irrigator', 'bipolar', 'scissors'];

// Verified CholecT50 annotation intervals supplied by Data/ML for VID01 and VID02.
export function getActionRows(caseId) {
  return tripletCsv.trim().split(/\r?\n/).slice(1).map(line => {
    const [id, start, end, instrument, verb, target, source] = line.split(',');
    return { case_id: id, start_sec: Number(start), end_sec: Number(end), instrument, verb, target, source };
  }).filter(row => row.case_id === caseId);
}
