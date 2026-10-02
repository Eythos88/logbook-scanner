# Log Book Scanner

A tiny installable web app (PWA) that photographs a handwritten log-book page, transcribes the
rows with Claude vision, lets you fix any misreads, and exports the result to Excel (`.xlsx`).

Built for a log format of **rows = a short time + a plain-text description of an event**, which
becomes a spreadsheet with `Date | Time | Description` columns. Pages accumulate across scans.

## Use it
1. Open the hosted URL on your phone and **Add to Home Screen** (works on iPhone and Android).
2. Paste your Anthropic API key once (stored only in your browser, on your device).
3. Set the **DPR day**, tap **Scan a page**, pick the **ROV** (asked before every photo), photograph the page.
4. Each line comes back cleaned up in DPR house style. Flagged lines (hard to read, unknown term, time out of
   order, over the line limit) are outlined — check them; the original handwriting is under *Handwritten*.
5. Tap **Export** → one `.xlsx` with only the TIME | TASK DESCRIPTION rows, formatted exactly like the master
   book. Copy the rows and paste them under the TIME header of that day's sheet.

## How it works
- Static site, no backend. The photo is downscaled in-browser and sent **directly** to the Anthropic Messages
  API (`claude-opus-5-5`, vision + structured output, server-side refusal fallback).
- **One pass, two outputs per line:** `raw` (exactly as handwritten) and `clean` (professional DPR line). The
  model reads the whole page plus the lines already logged that day for the same ROV before rewriting, uses
  the **master list** (Settings) for abbreviations / field IDs / ROV knowledge / tooling, and matches real
  lines from the master book. It is told never to add facts that are not in the handwriting.
- **Offline-safe:** photos go into an IndexedDB queue first and send when there is signal (Retry button, and
  automatically on reconnect). iOS doesn't sync in the background, so open the app to send.
- Excel export uses [xlsx-js-style](https://github.com/gitbrent/xlsx-js-style) (vendored). Format is measured
  from the master: `[hh]:mm` duration times (00:15 … 24:00), Calibri 10, B:L merged, master borders and
  column widths, no header, and lines over 127 chars continue on an `XXXX` row like the crew writes them.

## Files
`index.html` · `app.js` (UI, queue, export) · `dpr.js` (DPR format rules) · `prompt.js` (Claude request) ·
`knowledge.js` (starter master list + house-style examples) · `sw.js` · `manifest.webmanifest` · `icons/` · `vendor/`

## Tests
- `node test/export.test.js` — format rules + writes `test/out.xlsx`
- `python test/compare_master.py "<path to master .xlsm>"` — checks `out.xlsx` formatting cell-by-cell against the master
- `node test/live.test.js <keyfile>` — one real Claude call on `test/fixtures/page1.jpg` (synthetic page; ~6¢)

## Hosting
Any static host over HTTPS works (HTTPS is required for the camera and for PWA install). This repo
is set up for **GitHub Pages** — enable Pages on the `main` branch, root folder.
