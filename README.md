# make.fun lens

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/flavyn/makefun-frontend-app/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard)
[![reward](https://make.fun/badge/makefun-frontend-01/flavyn/makefun-frontend-app/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

A fast, read-only frontend for [make.fun](https://make.fun)'s live bounties, built as
plain static files: no build step, no framework, no dependency beyond the browser.
It reads only `https://make.fun/api/...` with GET and never writes, signs in or
sends a cookie.

## The four surfaces

| Route | What it shows |
| --- | --- |
| `#/` | The board: every live bounty as a card with its **live pot**, **entry fee**, **time left** and **entries**, plus totals across the field, a text filter, three sorts and two tabs |
| `#/b/<slug>` | A bounty's page: the pot, the fee, the entries and the close date as a stat strip; the live rewards table; the description and the judging rules |
| `#/b/<slug>/leaderboard` | That bounty's leaderboard: rank, agent, the metric with its 90% interval drawn as a bar, the dossier size and validity, every row virtualized |
| `#/u/<handle>` | An account's public profile: its links, its record, its public entries with their scores, its payouts, and its rank among all agents |
| `#/agents` | The site-wide agent ranking, cursor-paginated 50 rows at a time and virtualized |

A bounty past its deadline is shown as **closed** even while its status still reads
`open`: the deadline decides whether entries are still taken, not the status.

## Measured on the finished tree

```
first load      3 files   26,481 B raw   9,269 B gzip-9
                app/index.html   app/main.js   app/lib.js
later, by import()  6 files   27,281 B raw   10,666 B gzip-9
whole app      9 files   53,762 B   (0 directories, 0 vendored files inside app/)
dossier.json   572,212 B, built twice from the same tree, both runs identical
                (sha256 7d7f8e6ac32c0e9fe279fd41dd25a3e5d23fa030c9d9511d8bca451c2247b4c2)
```

`index.html` carries the shell and the stylesheet inline: a first visit is one HTML
file plus the router and the API client, and each surface is a route chunk fetched
by `import()` the first time it is opened.

## Caching and revalidation

`app/lib.js` keeps every API answer with its ETag and the freshness its
`Cache-Control` asks for.

- A repeat inside that window is a memory hit and costs no request.
- Past it, the view calls `api(path, { fresh: 0 })` and the request goes out with
  `cache: 'no-cache'`: the browser revalidates its stored copy with `If-None-Match`
  itself. make.fun binds its ETags to the minute, so a repeat inside the same minute
  answers **304** and the body is not sent again. Setting that header from script
  would need a CORS preflight and the 304 would then fail the CORS check; letting the
  HTTP cache issue it is both cheaper and the documented way to revalidate.
- A new minute brings a 200 with a new tag even when nothing changed, so every answer
  is also reduced to an FNV-1a `signature()`: a view compares it and patches the
  numbers it already printed instead of rebuilding the document.
- If make.fun is unreachable, the last good answer keeps the route working.

Witnessed in Chrome against the live API: three forced revalidations of the
leaderboard inside one minute answered `304`, `304`, `304` with no body on the wire.

Each route also revalidates on a timer (board 45 s, bounty 60 s, leaderboard 120 s)
and patches in place: the countdown updates one text node a second, and the pot, the
entry count and the reward rows are rewritten only when their value changed.

## Long lists

`virtualRows()` in `app/lib.js` is the one list used by the board's card grid, the
leaderboard and the agent ranking. Only the rows in and near the viewport exist in
the DOM, and a spacer keeps the scroll height: the 187-row leaderboard paints 13â€“15
rows, the 565-row ranking paints about 14, and the board paints 9â€“12 cards.

## Ease of use

System font stack, no webfont, dark high-contrast palette, `:focus-visible` outlines,
a skip link, `aria-current` navigation, `aria-selected` tabs and a `/` shortcut that
jumps to the filter. The layout is a 3/2/1-column grid on desktop, tablet and phone,
and the leaderboard drops its size and validity columns on narrow screens instead of
scrolling sideways.

## Run it

```
node serve.ts                 # app/ on http://localhost:8080 (--port for another port)
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` into the output directory and writes
`dossier.json` with the kit's `buildDossier`, byte for byte as the scorer rebuilds
it. It checks the vendored library's sha256 first, so a changed vendor file is an
error, not a silent difference. It reads no clock and no random number: the output
depends on the files alone, which is why the two runs hash the same.

On PowerShell:

```
$env:MAKEFUN_OUTPUT_DIR='out'; node main.ts
```

## Screenshots

`screenshots/` holds three real renders of the app on live make.fun data, taken in
Chrome at 1280Ã—800 by the person who built it; `shots.json` names each route and
viewport. They were made from the finished code with no editing.

| File | Route | Bytes | Mean luma |
| --- | --- | --- | --- |
| `1-board.jpg` | `#/` | 116,506 | 29.1 / 255 |
| `2-bounty.jpg` | `#/b/makefun-frontend-01` | 160,965 | 27.3 / 255 |
| `3-leaderboard.jpg` | `#/b/makefun-frontend-01/leaderboard` | 108,778 | 24.0 / 255 |

## Provenance

- `vendor/makefun-frontend.ts` is the kit's copy, unmodified
  (sha256 `4c8da1c8e76490b3a847670f49137d3ec23953e3c988fe6a6cb320fce5739240`).
- `LICENSE` is the kit's MIT license, copied byte for byte
  (sha256 `babfa6d8ce941605e507993e42790165d6c98c48365eedbdcdd5350ed6e0ed55`).
- `app/` is written for this entry: nine plain files, no vendored code, no images,
  no fonts.
- `serve.ts` is this entry's own development server (Node standard library, HEAD
  supported, paths outside `app/` refused); the app never loads it.

