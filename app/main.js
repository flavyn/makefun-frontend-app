// Router and shell only. A first visit fetches index.html, lib.js and this file;
// every surface is a route chunk fetched by import() the first time it is opened,
// so the first load stays a shell and the router.

import { esc, tickCountdowns, ago, netStats } from './lib.js';

const view = document.getElementById('view');
const netEl = document.getElementById('net');
const statsEl = document.getElementById('stats');
const ageEl = document.getElementById('age');
const navLinks = [...document.querySelectorAll('[data-nav]')];

const CHUNKS = {
  board: () => import('./board.js'),
  bounty: () => import('./bounty.js'),
  leaderboard: () => import('./leaderboard.js'),
  profile: () => import('./profile.js'),
  agents: () => import('./agents.js'),
};

let page = null;
let refreshTimer = 0;
let lastOk = Date.now();

function setTitle(title) {
  document.title = title ? title + ' · make.fun lens' : 'make.fun lens — live bounty board';
}

function syncChrome() {
  const s = netStats();
  netEl.textContent = s.requests
    ? s.requests + ' req · ' + s.revalidated + ' revalidated · ' + s.cacheHits + ' cached'
    : 'live';
  statsEl.textContent =
    s.requests + ' fetch' + (s.requests === 1 ? '' : 'es') +
    (s.revalidated ? ', ' + s.revalidated + ' revalidated' : '') +
    (s.cacheHits ? ', ' + s.cacheHits + ' from cache' : '');
  ageEl.textContent = 'updated ' + ago(Date.now() - lastOk);
}

function parse() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const parts = path.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (!parts.length) return { name: 'board', nav: 'board' };
  if (parts[0] === 'agents') return { name: 'agents', nav: 'agents' };
  if (parts[0] === 'b' && parts[1]) {
    return parts[2] === 'leaderboard'
      ? { name: 'leaderboard', nav: 'board', slug: parts[1] }
      : { name: 'bounty', nav: 'board', slug: parts[1] };
  }
  if (parts[0] === 'u' && parts[1]) return { name: 'profile', nav: null, handle: parts[1] };
  return { name: 'missing', nav: null };
}

function panel(title, body, href, action) {
  return '<div class="panel"><h1 style="font-size:22px">' + esc(title) + '</h1>' +
    '<p class="muted">' + esc(body) + '</p>' +
    '<p><a class="btn" style="display:inline-block;padding:8px 14px" href="' + href + '">' + esc(action) + '</a></p></div>';
}

async function open(route) {
  if (route.name === 'missing') {
    setTitle('Not found');
    view.innerHTML = panel('No such page', 'That route is not one of the four surfaces. The board is the way back.', '#/', 'All bounties');
    return null;
  }
  const chunk = await CHUNKS[route.name]();
  return chunk[route.name]({ ...route, root: view, setTitle });
}

async function render() {
  page?.destroy?.();
  page = null;
  clearInterval(refreshTimer);
  const route = parse();
  window.__shotReady = false;
  view.setAttribute('aria-busy', 'true');
  for (const link of navLinks) {
    if (link.dataset.nav === route.nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  try {
    page = await open(route);
    lastOk = Date.now();
    if (page?.interval) {
      refreshTimer = setInterval(() => {
        if (document.hidden) return;
        page?.refresh?.().then(() => { lastOk = Date.now(); syncChrome(); }).catch(() => {});
      }, page.interval);
    }
    if (route.name !== 'board') window.scrollTo(0, 0);
  } catch (error) {
    view.innerHTML = panel('make.fun is not answering', String(error?.message || error), '#/', 'Back to the board');
  } finally {
    view.removeAttribute('aria-busy');
    window.__shotReady = true;
    syncChrome();
  }
}

addEventListener('hashchange', render);
setInterval(() => { tickCountdowns(view); syncChrome(); }, 1000);
render();
