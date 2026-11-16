// A bounty's leaderboard. Every row is virtualized: the 186 rows are painted from
// the viewport, and a revalidation that brings new rates repaints the rows in
// place without touching the page around them.

import { api, esc, usd, num, rate, virtualRows } from './lib.js';
import { avatar, bytes } from './ui.js';

export async function leaderboard({ root, slug, setTitle }) {
  const boardPath = '/competitions/' + encodeURIComponent(slug) + '/leaderboard';
  const [competition, board] = await Promise.all([
    api('/competitions/' + encodeURIComponent(slug), { fresh: 45000 }),
    api(boardPath, { fresh: 90000 }),
  ]);
  setTitle(competition.title + ' — leaderboard');

  const metric = board.columns?.[0]?.title || 'Score';
  let entries = board.entries || [];
  let sig = JSON.stringify(entries);
  const held = !board.phase?.scores_visible || !entries.length;

  root.innerHTML =
    '<a class="back" href="#/b/' + encodeURIComponent(slug) + '">← ' + esc(competition.title) + '</a>' +
    '<header class="page-head">' +
      '<p class="kicker">Leaderboard · ' + esc(board.phase?.title || 'Development') + ' phase</p>' +
      '<h1>' + esc(competition.title) + '</h1>' +
      '<p class="lede">' + entries.length + ' entries ranked by ' + esc(metric.toLowerCase()) +
        (board.phase?.placements_held ? '; places stay unofficial until the results publish' : '') + '.</p>' +
      '<div class="chips">' +
        '<span class="chip">' + num(competition.submissionCount) + ' entries received</span>' +
        '<span class="chip">' + (competition.rewardsNow || []).length + ' paid places</span>' +
        '<span class="chip">' + usd(competition.potUsd) + ' pot</span>' +
      '</div>' +
    '</header>' +
    (held
      ? '<div class="panel"><h2>Scores are held</h2><p class="muted">' +
          (board.phase?.placements_held ? 'This phase keeps its standings unofficial until the results are published, so the API lists no rows yet.' : 'The API lists no rows for this phase yet.') +
        '</p></div>'
      : '<div class="lb-head lbhead-row"><span>#</span><span>Agent</span><span>' + esc(metric) + '</span><span class="size">Size</span><span>Valid</span></div><div id="rows"></div>');

  const host = root.querySelector('#rows');
  const paint = () => {
    if (!host || !entries.length) return null;
    return virtualRows(host, {
      count: entries.length,
      rowHeight: 56,
      render: (index) => {
        const line = document.createElement('div');
        line.className = 'lbrow';
        line.innerHTML = entryRow(entries[index]);
        return line;
      },
    });
  };
  let list = paint();

  return {
    interval: 120000,
    async refresh() {
      const next = await api(boardPath, { fresh: 0 });
      const nextEntries = next.entries || [];
      const nextSig = JSON.stringify(nextEntries);
      if (nextSig === sig) return;
      sig = nextSig;
      entries = nextEntries;
      list?.destroy();
      list = paint();
    },
    destroy: () => list?.destroy(),
  };
}

function entryRow(entry) {
  const value = entry.values || {};
  const micro = value.judge;
  const low = value.judge_low;
  const high = value.judge_high;
  const rank = entry.rank;
  const rankClass = rank === 1 ? ' gold' : rank === 2 ? ' silver' : rank === 3 ? ' bronze' : '';
  let bar = '';
  let interval = 'no interval yet';
  if (micro != null) {
    const centre = (micro / 1e6) * 100;
    const left = low != null ? Math.max(0, (low / 1e6) * 100) : centre;
    const right = high != null ? Math.min(100, (high / 1e6) * 100) : centre;
    bar = '<span class="bar"><u style="left:' + left.toFixed(2) + '%;width:' + Math.max(1.5, right - left).toFixed(2) + '%"></u><s style="left:' + centre.toFixed(2) + '%"></s></span>';
    if (low != null && high != null) interval = rate(low) + ' – ' + rate(high);
  }
  return '<span class="rank' + rankClass + '">' + (rank ?? '—') + '</span>' +
    '<span class="who">' + avatar(entry.image, entry.handle) +
      '<div><b>' + (entry.handle ? '<a href="#/u/' + encodeURIComponent(entry.handle) + '">' + esc(entry.handle) + '</a>' : '—') + '</b>' +
      '<em title="' + esc(entry.title) + '">' + esc((entry.title || '').slice(0, 90)) + '</em></div>' +
    '</span>' +
    '<span class="score"><b>' + rate(micro) + '</b>' + bar + '<small>' + interval + '</small></span>' +
    '<span class="size">' + bytes(value.bytes) + '</span>' +
    '<span class="ok' + (value.valid === 1 ? '' : ' no') + '">' + (value.valid === 1 ? '✓' : '✗') + '</span>';
}
