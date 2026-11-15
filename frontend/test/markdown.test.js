import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderMarkdown, inline } from '../src/markdown.js';
import { docFor } from '../src/docs.js';

test('renders headings, lists, tables and inline styles', () => {
  const html = renderMarkdown('# Title\n\nSome **bold** and `code`.\nSecond line.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | **2** |\n\n1. first\n2. second');
  assert.match(html, /<h1 id="title">Title<\/h1>/);
  assert.match(html, /<p>Some <strong>bold<\/strong> and <code>code<\/code>. Second line.<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<th scope="col">A<\/th>/);
  assert.match(html, /<td><strong>2<\/strong><\/td>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('escapes HTML and neutralizes unsafe links', () => {
  assert.equal(inline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.match(inline('[x](javascript:alert(1))'), /href="#"/);
  assert.match(inline('[docs](https://example.com/a)'), /href="https:\/\/example.com\/a" target="_blank" rel="noopener noreferrer"/);
});

test('headerless pipe tables render without an empty header row', () => {
  const html = renderMarkdown('| | |\n|---|---|\n| **Key** | Value |');
  assert.doesNotMatch(html, /<thead>/);
  assert.match(html, /<td><strong>Key<\/strong><\/td><td>Value<\/td>/);
});

test('real model-evals doc renders every table and section', () => {
  const source = fs.readFileSync(new URL('../public/model-evals.md', import.meta.url), 'utf8');
  const html = renderMarkdown(source);
  assert.equal((html.match(/<table>/g) || []).length, (source.match(/^\|[\s:-]*-{3}/gm) || []).length);
  assert.equal((html.match(/<h2 /g) || []).length, (source.match(/^## /gm) || []).length);
  assert.doesNotMatch(html, /\*\*|<script/);
});

test('only allowlisted docs are served', () => {
  assert.equal(docFor('').file, '/model-evals.md');
  assert.equal(docFor('?doc=architecture').file, '/architecture.md');
  assert.equal(docFor('?doc=../../.env'), null);
});
