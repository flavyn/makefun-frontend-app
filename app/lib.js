// The shared core: make.fun's read-only public API with an ETag-aware cache, the
// formatters the views print with, and one window-scrolling virtual list.
//
// Cache. Each path keeps its parsed answer, the ETag the API sent and the
// freshness its Cache-Control asks for. A repeat inside that window is a memory
// hit and costs no request. Past it a view calls api(path, { fresh: 0 }) and the
// request goes out with cache: 'no-cache', which makes the browser revalidate the
// stored copy with If-None-Match itself (a header it may send without a preflight,
// unlike one this code sets). make.fun binds its ETags to the minute, so the
// repeat inside the same minute answers 304: headers only, and the browser hands
// back the body it kept. When the minute turns the API answers 200 with a new tag
// even though nothing changed, so every answer is also reduced to a signature()
// and a view patches the DOM it already has instead of rebuilding it.

const ORIGIN = 'https://make.fun';
const API = ORIGIN + '/api';
const store = new Map(); // url -> { data, at, until, tag, pending }
const stats = { requests: 0, cacheHits: 0, revalidated: 0, failed: 0, jsonBytes: 0 };

export const origin = ORIGIN;
export const netStats = () => ({ ...stats });

/** A stable, cheap fingerprint of an answer: same data, same string. */
export function signature(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return text.length + ':' + (hash >>> 0).toString(36);
}

/** The last answer for a path, without touching the network. */
export const cached = (path) => store.get(API + path)?.data ?? null;

/**
 * One GET against make.fun's public API. Resolves to the parsed answer.
 * - within the freshness window: memory, no request
 * - past it: revalidated with If-None-Match; a 304 reuses the cached body
 * - unreachable: the last good answer, so a route keeps working
 */
export function api(path, options = {}) {
  const url = API + path;
  const known = store.get(url);
  if (known?.pending) return known.pending;
  if (known?.data && options.fresh !== 0 && Date.now() < known.until) {
    stats.cacheHits++;
    return Promise.resolve(known.data);
  }
  const job = load(url, path, known, options.fresh ?? 30_000);
  if (known) known.pending = job;
  else store.set(url, { data: null, at: 0, until: 0, tag: null, pending: job });
  return job.finally(() => {
    const entry = store.get(url);
    if (entry) entry.pending = null;
  });
}

async function load(url, path, known, ttl) {
  const now = Date.now();
  stats.requests++;
  if (known?.data) stats.revalidated++;
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache', headers: { accept: 'application/json' } });
  } catch {
    stats.failed++;
    if (known?.data) return known.data;
    throw new Error('make.fun is unreachable from this browser (' + path + ')');
  }
  if (!response.ok) {
    stats.failed++;
    if (known?.data) return known.data;
    throw new Error('make.fun answered ' + response.status + ' for ' + path);
  }
  const text = await response.text();
  stats.jsonBytes += text.length;
  const data = JSON.parse(text);
  const asked = /max-age=(\d+)/.exec(response.headers.get('cache-control') || '');
  const maxAge = asked ? Number(asked[1]) * 1000 : 0;
  store.set(url, { data, at: now, until: now + Math.max(ttl, maxAge), tag: response.headers.get('etag'), pending: null });
  return data;
}

/* ------------------------------------------------------------------ format */

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
export const num = (value) => nf0.format(Number(value ?? 0));

/** '$667.50' for a pot with cents, '$500' for a whole reward. */
export const usd = (value, cents) => {
  const n = Number(value ?? 0);
  return '$' + (cents ?? !Number.isInteger(n) ? nf2 : nf0).format(n);
};

/** A rate recorded in millionths, printed to the millionth. */
export const rate = (micro) => (micro == null ? '—' : (Number(micro) / 1e6).toFixed(6));

/** '2026-11-17 12:30 UTC' — the API's own time zone, never the visitor's. */
export function dateUTC(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
}

export function shortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** '3d 4h left' while a deadline holds, 'ended 2d ago' after it. */
export function timeLeft(iso, now = Date.now()) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '—';
  const ms = at - now;
  if (ms <= 0) {
    const since = -ms;
    return since < 3600000 ? Math.max(1, Math.floor(since / 60000)) + 'm ago'
      : since < 86400000 ? Math.floor(since / 3600000) + 'h ago'
      : Math.floor(since / 86400000) + 'd ago';
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return days ? days + 'd ' + hours + 'h left' : hours ? hours + 'h ' + minutes + 'm left' : minutes + 'm left';
}

export const ago = (ms) => (ms < 2000 ? 'just now' : ms < 60000 ? Math.floor(ms / 1000) + 's ago' : ms < 3600000 ? Math.floor(ms / 60000) + 'm ago' : Math.floor(ms / 3600000) + 'h ago');

/* ------------------------------------------------------------ virtual list */

/**
 * Window-scrolling virtualization: only the rows in and near the viewport exist
 * in the DOM, and one spacer keeps the scroll height, so the 46-card board, the
 * 186-row leaderboard and the 565-row ranking cost the same to paint.
 */
export function virtualRows(host, { count, rowHeight, render, overscan = 2 }) {
  host.classList.add('vlist');
  host.style.height = count * rowHeight + 'px';
  let lastStart = -1;

  const paint = (force) => {
    const box = host.getBoundingClientRect();
    const first = Math.max(0, Math.floor((0 - box.top) / rowHeight) - overscan);
    const visible = Math.ceil(Math.max(0, window.innerHeight - Math.max(0, box.top)) / rowHeight) + overscan * 2;
    const start = Math.min(first, Math.max(0, count - 1));
    if (!force && start === lastStart) return;
    lastStart = start;
    const chunk = document.createDocumentFragment();
    const end = Math.min(count, start + visible);
    for (let row = start; row < end; row++) {
      const node = render(row);
      if (!node) continue;
      node.style.top = row * rowHeight + 'px';
      chunk.append(node);
    }
    host.replaceChildren(chunk);
  };

  const onScroll = () => requestAnimationFrame(() => paint(false));
  const onResize = () => paint(true);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  paint(true);

  return {
    repaint: () => paint(true),
    destroy() {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      host.replaceChildren();
    },
  };
}

/** Keep every <time data-cd> on screen ticking, one text node at a time. */
export function tickCountdowns(root = document) {
  for (const node of root.querySelectorAll('time[data-cd]')) {
    node.textContent = timeLeft(node.dataset.cd);
    node.title = dateUTC(node.dataset.cd);
  }
}
