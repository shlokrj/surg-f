import '@fontsource-variable/inclusive-sans';
import './style.css';
import './home.css';
import './evals.css';
import { wordmark } from './home.js';
import { renderMarkdown } from './markdown.js';
import { docFor } from './docs.js';

async function main() {
  const app = document.querySelector('#app');
  const doc = docFor(location.search);
  app.innerHTML = `<header class="topbar"><a class="logo-link" href="/" aria-label="surg+f home">${wordmark('topbar-mark')}</a><span class="top-spacer"></span><a class="top-action" href="/">Back to the demo</a></header>
    <main class="doc-page" id="main-content"><article class="doc" aria-busy="true"><p class="doc-status" role="status">Loading…</p></article></main>`;
  const article = app.querySelector('.doc');
  const fail = message => { article.innerHTML = `<p class="doc-status" role="alert">${message} <a href="/">Back to the demo</a></p>`; article.removeAttribute('aria-busy'); };
  if (!doc) return fail('That page does not exist.');
  document.title = `${doc.title} · surg+f`;
  try {
    const response = await fetch(doc.file);
    const text = response.ok ? await response.text() : '';
    // Vite falls back to index.html for missing files; treat any HTML as missing.
    if (!response.ok || /^\s*<!doctype html/i.test(text)) return fail('This page is not available yet.');
    article.innerHTML = renderMarkdown(text);
    article.removeAttribute('aria-busy');
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch {
    fail('Could not load this page. Check your connection and try again.');
  }
}

if (typeof document !== 'undefined' && document.querySelector('#app')) main();
