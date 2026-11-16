// A bounty's page: the pot, the entry fee, the time left and the live rewards
// table first, then the description and the judging rules. The numbers are patched
// in place when a revalidation brings new ones; the page itself is never rebuilt.

import { api, esc, usd, num, dateUTC, timeLeft, tickCountdowns } from './lib.js';
import { badge, isLive, md } from './ui.js';

export async function bounty({ root, slug, setTitle }) {
  const path = '/competitions/' + encodeURIComponent(slug);
  let data = await api(path, { fresh: 45000 });
  let sig = JSON.stringify(data);
  setTitle(data.title);
  root.innerHTML = markup(data);
  tickCountdowns(root);

  const pot = root.querySelector('[data-pot]');
  const fees = root.querySelector('[data-fees]');
  const entries = root.querySelector('[data-entries]');
  const status = root.querySelector('[data-status]');
  const rewards = root.querySelector('[data-rewards]');

  return {
    interval: 60000,
    async refresh() {
      const next = await api(path, { fresh: 0 });
      if (JSON.stringify(next) === sig) return;
      sig = JSON.stringify(next);
      data = next;
      if (pot) pot.textContent = usd(next.potUsd);
      if (fees) fees.textContent = usd(next.rewardAmount) + (Number(next.entryFeesUsd) ? ' + ' + usd(next.entryFeesUsd) + ' entry fees' : ' base');
      if (entries) entries.textContent = num(next.submissionCount);
      if (status) status.textContent = next.status + (isLive(next) ? ' · taking entries' : ' · entries closed');
      if (rewards) rewards.innerHTML = rewardRows(next);
      tickCountdowns(root);
    },
  };
}

function markup(b) {
  const places = (b.rewardsNow || []).length;
  return '<a class="back" href="#/">← All bounties</a>' +
    '<header class="page-head">' +
      '<p class="kicker">' + esc(b.category || 'Bounty') + ' · by ' + esc(b.sponsor?.name || 'make.fun') + (b.sponsor?.isVerified ? ' <span title="verified sponsor" style="color:var(--acc)">✓</span>' : '') + '</p>' +
      '<h1>' + esc(b.title) + '</h1>' +
      '<p class="lede">' + esc(b.summary || '') + '</p>' +
      '<div class="chips">' + badge(b) +
        '<span class="chip" data-status>' + esc(b.status) + (isLive(b) ? ' · taking entries' : ' · entries closed') + '</span>' +
        '<span class="chip">' + places + ' paid places</span>' +
        '<span class="chip">closes ' + dateUTC(b.deadline) + '</span>' +
      '</div>' +
    '</header>' +
    '<section class="stats">' +
      '<div class="stat"><span>Live pot</span><b data-pot>' + usd(b.potUsd) + '</b><em data-fees>' + usd(b.rewardAmount) + (Number(b.entryFeesUsd) ? ' + ' + usd(b.entryFeesUsd) + ' entry fees' : ' base') + '</em></div>' +
      '<div class="stat"><span>Entry fee</span><b>' + (Number(b.entryFeeUsd) > 0 ? usd(b.entryFeeUsd) : 'none') + '</b><em>' + (Number(b.entryFeeUsd) > 0 ? 'one payment per account' : 'free to enter') + '</em></div>' +
      '<div class="stat"><span>Entries</span><b data-entries>' + num(b.submissionCount) + '</b><em>from ' + num(b.entryFeePayers || 0) + ' fee payers</em></div>' +
      '<div class="stat"><span>Closes</span><b><time data-cd="' + esc(b.deadline) + '">' + timeLeft(b.deadline) + '</time></b><em>' + dateUTC(b.deadline) + '</em></div>' +
    '</section>' +
    '<div class="cols">' +
      '<article class="panel prose">' +
        '<h2>About this bounty</h2>' + md(b.description || b.summary || '') +
        rules(b) +
      '</article>' +
      '<aside class="side">' +
        '<section class="panel">' +
          '<h2>Rewards <span class="muted" style="font-weight:400">· ' + usd(b.potUsd) + ' live pot</span></h2>' +
          '<table class="rewards"><thead><tr><th>#</th><th>Base</th><th>Fees</th><th class="num">Now</th></tr></thead>' +
          '<tbody data-rewards>' + rewardRows(b) + '</tbody></table>' +
          '<p class="tiny" style="margin-top:10px">The live pot is the base plus every entry fee paid; fees are split over the paid places in proportion to their rewards.</p>' +
          '<a class="btn" href="#/b/' + encodeURIComponent(b.slug) + '/leaderboard">Leaderboard →</a>' +
        '</section>' +
      '</aside>' +
    '</div>';
}

function rewardRows(b) {
  return (b.rewardsNow || []).map((row) =>
    '<tr><td>' + row.place + '</td><td>' + usd(row.baseUsd) + '</td><td>' + (Number(row.feeShareUsd) ? usd(row.feeShareUsd) : '—') + '</td><td class="num">' + usd(row.amountUsd) + '</td></tr>',
  ).join('');
}

function rules(b) {
  const r = b.resolution;
  if (!r) return '';
  const metric = r.metric ? '<p><strong>Ranked by</strong> ' + esc(r.metric.name) + (r.metric.unit ? ' (' + esc(r.metric.unit) + ')' : '') + ' — ' + esc(r.metric.better) + ' is better.</p>' : '';
  return '<h2>How it is judged</h2>' +
    (r.summary ? '<p>' + esc(r.summary) + '</p>' : '') +
    (r.criteria?.length ? '<ul class="criteria">' + r.criteria.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '') +
    metric +
    (r.tieBreak ? '<p><strong>Tie-break:</strong> ' + esc(r.tieBreak) + '</p>' : '') +
    (r.verifier ? '<p class="muted">' + esc(r.verifier) + '</p>' : '');
}
