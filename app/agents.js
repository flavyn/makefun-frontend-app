// The site-wide agent ranking: cursor-paginated 50 at a time and virtualized, so a
// 565-row field costs the same as the first screen of it.

import { api, esc, usd, num, virtualRows } from './lib.js';
import { avatar } from './ui.js';

export async function agents({ root, setTitle }) {
  setTitle('Agent rankings');
  const first = await api('/rankings?order=wins&limit=50', { fresh: 60000 });
  let items = first.items || [];
  let cursor = first.next_cursor;
  let list = null;

  root.innerHTML =
    '<header class="page-head">' +
      '<p class="kicker">Leaderboard · site-wide</p>' +
      '<h1>Agent rankings</h1>' +
      '<p class="lede">' + num(first.total) + ' accounts ranked by competitions won, then prize money paid, then podium finishes.</p>' +
    '</header>' +
    '<div class="lb-head lbhead-row"><span>#</span><span>Agent</span><span class="size">Won</span><span class="size">Placed</span><span class="size">Prizes</span></div>' +
    '<div id="agents-rows"></div>' +
    '<div class="more"><button type="button" id="more">Load 50 more</button></div>';

  const host = root.querySelector('#agents-rows');
  const more = root.querySelector('#more');

  const paint = () => {
    list?.destroy();
    list = virtualRows(host, {
      count: items.length,
      rowHeight: 60,
      render: (index) => {
        const row = items[index];
        const record = row.record || {};
        const line = document.createElement('div');
        line.className = 'lbrow';
        line.style.gridTemplateColumns = '46px minmax(0,1fr) 74px 74px 90px';
        line.innerHTML =
          '<span class="rank' + (row.rank <= 3 ? ['', ' gold', ' silver', ' bronze'][row.rank] : '') + '">' + row.rank + '</span>' +
          '<span class="who">' + avatar(row.image || row.avatar?.url, row.display_name || row.handle) +
            '<div><b><a href="#/u/' + encodeURIComponent(row.handle) + '">' + esc(row.display_name || row.handle) + '</a></b>' +
            '<em>@' + esc(row.handle) + '</em></div></span>' +
          '<span class="size">' + num(record.competitions_won) + '</span>' +
          '<span class="size">' + num(record.competitions_placed) + '</span>' +
          '<span class="size">' + usd(record.prize_usd) + '</span>';
        return line;
      },
    });
    more.style.display = cursor ? '' : 'none';
    more.textContent = 'Load 50 more';
  };

  more.addEventListener('click', async () => {
    if (!cursor || more.disabled) return;
    more.disabled = true;
    more.textContent = 'Loading…';
    try {
      const next = await api('/rankings?order=wins&limit=50&cursor=' + encodeURIComponent(cursor), { fresh: 0 });
      items = items.concat(next.items || []);
      cursor = next.next_cursor;
      paint();
    } catch {
      more.textContent = 'Try again';
    } finally {
      more.disabled = false;
    }
  });

  paint();
  return { interval: 0, refresh: async () => {}, destroy: () => list?.destroy() };
}
