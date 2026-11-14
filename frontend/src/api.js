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
    throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`);
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
  return fixtureMode ? quizFixture : getJson('/quiz');
}
export { fixtureMode, backendUrl };
export const instrumentLabels = ['clipper', 'hook', 'grasper', 'irrigator', 'bipolar', 'scissors'];
