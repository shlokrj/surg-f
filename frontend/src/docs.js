// Only team-written docs in public/ may be shown on the reading page (evals.html).
export const DOCS = {
  'model-evals': { file: '/model-evals.md', title: 'Model results' },
  architecture: { file: '/architecture.md', title: 'How it works' },
};

export function docFor(search) {
  const name = new URLSearchParams(search).get('doc') || 'model-evals';
  return Object.hasOwn(DOCS, name) ? { name, ...DOCS[name] } : null;
}
