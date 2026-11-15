// Minimal Markdown renderer for the team's static docs (headings, paragraphs, lists,
// pipe tables, bold, italic, inline code and links). All text is HTML-escaped first.
const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const safeHref = href => /^(https?:\/\/|\/|#|\.{0,2}\/)/.test(href) || /^[\w.-]+(#[\w-]*)?$/.test(href) ? href : '#';

export function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const target = safeHref(href.replace(/&amp;/g, '&'));
      const external = /^https?:/.test(target) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escape(target)}"${external}>${label}</a>`;
    });
}

const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
const isDivider = row => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(row);

function table(rows) {
  const header = cells(rows[0]), body = rows.slice(2).map(cells);
  const head = header.some(Boolean) ? `<thead><tr>${header.map(c => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>` : '';
  return `<div class="md-table"><table>${head}<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length, html = inline(heading[2].trim());
      out.push(`<h${level} id="${slug(html)}">${html}</h${level}>`); i++; continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      out.push(table(rows)); continue;
    }
    const bullet = /^\s*[-*]\s+/, numbered = /^\s*\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const pattern = bullet.test(line) ? bullet : numbered, tag = pattern === bullet ? 'ul' : 'ol', items = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ''));
      out.push(`<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`); continue;
    }
    if (/^```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i]) && !lines[i].trim().startsWith('|')) paragraph.push(lines[i++].trim());
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    else out.push(`<p>${inline(lines[i++].trim())}</p>`);
  }
  return out.join('\n');
}
