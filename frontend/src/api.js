import fixture from '../../shared/search.fixture.json';

const backendUrl = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const fixtureMode = import.meta.env.VITE_USE_FIXTURE === 'true';

export async function searchClips(query) {
  if (fixtureMode) {
    const words = query.toLowerCase().trim().split(/\s+/);
    return fixture.results.filter(result => words.every(word => result.label.toLowerCase().includes(word)));
  }
  const response = await fetch(`${backendUrl}/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data.results)) throw new Error('Invalid search response');
  return data.results;
}

export { fixtureMode, backendUrl };
