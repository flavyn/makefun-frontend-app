// The board: make.fun's live bounties, one request, a virtualized card grid.
//
// A card answers the question the board exists for: what is the pot, what does it
// cost to enter, how long is left, how many are in. A bounty past its deadline is
// shown as closed even while its status still reads open, because that is the
// field that decides whether entries are still taken.

import { api, signature, esc, usd, num, timeLeft, shortDate, virtualRows, tickCountdowns } from './lib.js';
import { isLive } from './ui.js';

const PATH = '/competitions?status=open&activity=times';
const CARD_ROW = 200;
const rowCount = () => (innerWidth >= 1060 ? 3 : innerWidth >= 700 ? 2 : 1);

export async function board({ root }) {
  const state = { tab: 'live', sort: 'deadline', q: '' };
  let items = (await api(PATH, { fresh: 45000 })).items || [];
  let sig = signature(items);
  let list = null;
  let cols = rowCount();

  root.innerHTML =
    '<section class="stats" id="strip" aria-label="Live totals"></section>' +
    '<div class="toolbar">' +
      '<div class="tabs" role="tablist" aria-label="Which bounties">' +
        '<button type="button" role="tab" data-tab="live" aria-selected="true">Live</button>' +
        '<button type="button" role="tab" data-tab="open">All open</button>' +
      '</div>' +
      '<label class="search"><input id="q" type="search" placeholder="Filter by title, sponsor or skill…" autocomplete="off" aria-label="Filter bounties"><kbd>/</kbd></label>' +
      '<label class="sort">Sort<select id="sort" aria-label="Sort bounties">' +
        '<option value="deadline">closing soonest</option><option value="pot">biggest pot</option>' +
        '<option value="entries">most entries</option><option value="reward">biggest reward</option>' +
      '</select></label>' +
    '</div>' +
    '<div class="list-head"><p id="count"></p><p>“all open” keeps bounties whose entries closed until their results publish; the badge says which is which</p></div>' +
    '<div id="cards"></div>';

  const strip = root.querySelector('#strip');
  const cards = root.querySelector('#cards');
  const countEl = root.querySelector('#count');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const search = root.querySelector('#q');
  const sort = root.querySelector('#sort');

  const picked = () => {
    const q = state.q.trim().toLowerCase();
    const rows = items.filter((b) => {
      if (state.tab === 'live' && !isLive(b)) return false;
      if (!q) return true;
      return (b.title + ' ' + b.summary + ' ' + (b.category || '') + ' ' + (b.sponsor?.name || '') + ' ' + (b.skills || []).join(' ')).toLowerCase().includes(q);
    });
    const order = {
      deadline: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
      pot: (a, b) => Number(b.potUsd) - Number(a.potUsd),
      entries: (a, b) => b.submissionCount - a.submissionCount,
      reward: (a, b) => b.rewardAmount - a.rewardAmount,
    };
    return rows.sort(order[state.sort] || order.deadline);
  };

  function paintStrip() {
    const live = items.filter(isLive);
    const pot = live.reduce((sum, b) => sum + Number(b.potUsd || 0), 0);
    const entries = live.reduce((sum, b) => sum + Number(b.submissionCount || 0), 0);
    const soon = [...live].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))[0];
    strip.innerHTML =
      '<div class="stat"><span>Live bounties</span><b>' + live.length + '</b><em>of ' + items.length + ' still listed</em></div>' +
      '<div class="stat"><span>Live pot</span><b>' + usd(pot) + '</b><em>base plus entry fees</em></div>' +
      '<div class="stat"><span>Entries in play</span><b>' + num(entries) + '</b><em>across live bounties</em></div>' +
      '<div class="stat"><span>Next deadline</span><b>' + (soon ? timeLeft(soon.deadline) : '—') + '</b><em>' + (soon ? esc(soon.title.slice(0, 38)) : 'none scheduled') + '</em></div>';
  }

  function paint() {
    const rows = picked();
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
    list?.destroy();
    list = null;
    cols = rowCount();
    countEl.textContent = rows.length + (rows.length === 1 ? ' bounty' : ' bounties') + (state.q ? ' matching “' + state.q + '”' : '');
    paintStrip();
    if (!rows.length) {
      cards.style.height = '0';
      cards.innerHTML = '<p class="empty">No bounty matches that filter.</p>';
      return;
    }
    cards.innerHTML = '';
    list = virtualRows(cards, {
      count: Math.ceil(rows.length / cols),
      rowHeight: CARD_ROW,
      render: (row) => {
        const line = document.createElement('div');
        line.className = 'vrow';
        line.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
        line.innerHTML = rows.slice(row * cols, row * cols + cols).map(card).join('');
        return line;
      },
    });
    tickCountdowns(root);
  }

  for (const tab of tabs) tab.addEventListener('click', () => { state.tab = tab.dataset.tab; paint(); });
  search.addEventListener('input', () => { state.q = search.value; paint(); });
  sort.addEventListener('change', () => { state.sort = sort.value; paint(); });
  const onKey = (event) => {
    if (event.key === '/' && document.activeElement !== search) { event.preventDefault(); search.focus(); }
  };
  const onResize = () => { if (rowCount() !== cols) paint(); };
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  paint();

  return {
    interval: 45000,
    async refresh() {
      const next = (await api(PATH, { fresh: 0 })).items || [];
      const nextSig = signature(next);
      if (nextSig === sig) return;
      sig = nextSig;
      items = next;
      paint();
    },
    destroy() {
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
      list?.destroy();
    },
  };
}

function card(b) {
  const live = isLive(b);
  const places = Object.keys(b.rewards || {}).length;
  const fee = Number(b.entryFeeUsd) > 0 ? usd(b.entryFeeUsd) + ' fee' : 'no fee';
  const fees = Number(b.entryFeesUsd) > 0 ? '+' + usd(b.entryFeesUsd) + ' in fees' : 'live pot';
  const badge = live ? 'live' : b.status === 'resolved' ? 'resolved' : 'closed';
  return '<article class="card">' +
    '<div class="card-top"><span class="cat">' + esc(b.category || 'Bounty') + '</span><span class="badge ' + badge + '">' + badge + '</span></div>' +
    '<h3 class="card-title"><a href="#/b/' + encodeURIComponent(b.slug) + '">' + esc(b.title) + '</a></h3>' +
    '<p class="pot">' + usd(b.potUsd) + '<span>' + fees + '</span></p>' +
    '<p class="meta"><span>' + fee + '</span><span>' + num(b.submissionCount) + ' entries</span><time data-cd="' + esc(b.deadline) + '">' + timeLeft(b.deadline) + '</time></p>' +
    '<p class="tiny">' + places + ' paid places · ' + usd(b.rewardAmount) + ' base · closes ' + shortDate(b.deadline) + '</p>' +
    '</article>';
}
