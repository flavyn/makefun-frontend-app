// View helpers shared by the route chunks (loaded with them, not with the shell).

import { esc } from './lib.js';

export const isLive = (b) => Date.parse(b.deadline) > Date.now();

export function badge(b) {
  const kind = isLive(b) ? 'live' : b.status === 'resolved' ? 'resolved' : 'closed';
  return '<span class="badge ' + kind + '">' + kind + '</span>';
}

export function avatar(image, name, extra = '') {
  if (!image) return '<span class="av ph ' + extra + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
  const src = image.startsWith('http') ? image : 'https://make.fun' + image;
  return '<img class="av ' + extra + '" crossorigin="anonymous" src="' + esc(src) + '" alt="" width="28" height="28" loading="lazy" decoding="async">';
}

export const external = (href, label) => '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>';

/** Two letters for an account with no avatar. */
export function initials(name) {
  return String(name ?? '?').replace(/[^a-z0-9]+/gi, ' ').trim().split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/** A small Markdown renderer for the API's prose: headings, lists, bold, code, paragraphs. */
export function md(source) {
  const lines = String(source ?? '').split('\n');
  const out = [];
  let list = false;
  let code = false;
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line.trim())) { closeList(); code = !code; out.push(code ? '<pre>' : '</pre>'); continue; }
    if (code) { out.push(esc(line)); continue; }
    if (!line.trim()) { closeList(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const size = Math.min(heading[1].length + 1, 4);
      out.push('<h' + size + '>' + inline(heading[2]) + '</h' + size + '>');
      continue;
    }
    const item = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(item[1]) + '</li>'); continue; }
    if (/^>/.test(line)) { closeList(); out.push('<p class="muted">' + inline(line.replace(/^>\s?/, '')) + '</p>'); continue; }
    closeList();
    out.push('<p>' + inline(line) + '</p>');
  }
  closeList();
  if (code) out.push('</pre>');
  return out.join('');
}
