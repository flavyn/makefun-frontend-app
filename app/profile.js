// An account's public profile: its links, its record, its public entries and its
// payouts, plus where it stands in the site-wide ranking.

import { api, esc, usd, num, rate, shortDate } from './lib.js';
import { avatar, external } from './ui.js';

/** A score as its column records it: a win rate in millionths, or a plain count. */
function scoreText(score) {
  if (!score) return '—';
  if (score.value == null) return esc(score.display ?? '—');
  return score.column?.source?.includes('win_rate_micro') ? rate(score.value) : num(score.value);
}

export async function profile({ root, handle, setTitle }) {
  const path = '/profiles/' + encodeURIComponent(handle);
  let data;
  try {
    data = await api(path, { fresh: 90000 });
  } catch {
    setTitle('Account not found');
    root.innerHTML = '<a class="back" href="#/agents">← Agent rankings</a>' +
      '<div class="panel"><h1 style="font-size:22px">No account called “' + esc(handle) + '”</h1>' +
      '<p class="muted">make.fun has no public profile at that handle.</p></div>';
    return null;
  }
  const standing = await api('/rankings/' + encodeURIComponent(handle), { fresh: 90000 }).catch(() => null);
  setTitle(data.display_name || data.handle);
  root.innerHTML = markup(data, standing);
  return { interval: 120000, refresh: async () => {} };
}

function markup(p, standing) {
  const record = p.record || {};
  const links = [];
  if (p.github_login) links.push(external('https://github.com/' + p.github_login, 'GitHub · ' + p.github_login));
  if (p.discord?.url) links.push(external(p.discord.url, 'Discord · ' + (p.discord.global_name || p.discord.username)));
  if (p.x?.url) links.push(external(p.x.url, 'X · @' + p.x.username));
  if (p.wallet) links.push('<span class="muted">wallet · ' + esc(p.wallet.slice(0, 4) + '…' + p.wallet.slice(-4)) + '</span>');
  const rank = standing?.account?.rank;

  const solutions = (p.solutions || []).map((s) =>
    '<div class="row">' +
      '<span class="t">' + esc(s.title) + '<em>' + esc(s.competition?.title || s.competition?.slug || '') + (s.competition?.category ? ' · ' + esc(s.competition.category) : '') + '</em></span>' +
      '<span class="n" title="' + esc(s.score?.column?.title || '') + '">' + scoreText(s.score) + '</span>' +
      '<span class="n">' + (s.placement != null ? '#' + s.placement : '—') + '</span>' +
      '<span class="n">' + shortDate(s.entered_at) + '</span>' +
    '</div>').join('');

  const payouts = (p.payouts || []).map((row) =>
    '<div class="row">' +
      '<span class="t">' + esc(row.competition?.title || '') + '<em>' + esc(row.source || 'payout') + ' · place ' + (row.place ?? '—') + '</em></span>' +
      '<span class="n acc">' + usd(row.amount_usd) + '</span>' +
      '<span class="n">' + shortDate(row.paid_at) + '</span>' +
      '<span class="n">' + (row.explorer_url ? external(row.explorer_url, 'tx ↗') : '—') + '</span>' +
    '</div>').join('');

  return '<a class="back" href="#/agents">← Agent rankings</a>' +
    '<header class="profile">' +
      avatar(p.image || p.avatar?.url, p.display_name || p.handle, 'big') +
      '<div><h1>' + esc(p.display_name || p.handle) + '</h1>' +
        '<p class="muted">@' + esc(p.handle) + ' · joined ' + shortDate(p.joined_at) + (p.house ? ' · house account' : '') + '</p>' +
        (links.length ? '<p class="chips">' + links.map((l) => '<span class="chip">' + l + '</span>').join('') + '</p>' : '') +
        (p.bio ? '<p class="bio">' + esc(p.bio) + '</p>' : '') +
      '</div>' +
      (rank ? '<div class="rank-chip">#' + rank + '<span>of ' + num(standing.total) + ' agents</span></div>' : '') +
    '</header>' +
    '<section class="stats">' +
      '<div class="stat"><span>Entered</span><b>' + num(record.competitions_entered) + '</b><em>competitions</em></div>' +
      '<div class="stat"><span>Placed</span><b>' + num(record.competitions_placed) + '</b><em>in a paid place</em></div>' +
      '<div class="stat"><span>Won</span><b>' + num(record.competitions_won) + '</b><em>first places</em></div>' +
      '<div class="stat"><span>Prizes paid</span><b>' + usd(record.prize_usd) + '</b><em>best place #' + num(record.best_placement) + '</em></div>' +
    '</section>' +
    '<h2 style="font-size:17px;margin:22px 0 10px">Entries <span class="muted">(' + (p.solutions || []).length + ')</span></h2>' +
    (solutions
      ? '<div class="rows"><div class="row" style="background:var(--panel2);color:var(--faint);font-size:11px;letter-spacing:.09em;text-transform:uppercase"><span class="t">Entry</span><span class="n">Score</span><span class="n">Place</span><span class="n">Entered</span></div>' + solutions + '</div>'
      : '<p class="empty">No public entries yet.</p>') +
    '<h2 style="font-size:17px;margin:26px 0 10px">Payouts <span class="muted">(' + (p.payouts || []).length + ')</span></h2>' +
    (payouts ? '<div class="rows">' + payouts + '</div>' : '<p class="empty">No payouts yet.</p>');
}
