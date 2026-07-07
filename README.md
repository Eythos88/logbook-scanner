# Log Book Scanner

A tiny installable web app (PWA) that photographs a handwritten log-book page, transcribes the
rows with Claude vision, lets you fix any misreads, and exports the result to Excel (`.xlsx`).

Built for a log format of **rows = a short time + a plain-text description of an event**, which
becomes a spreadsheet with `Date | Time | Description` columns. Pages accumulate across scans.

## Use it
1. Open the hosted URL on your phone and **Add to Home Screen**.
2. Paste your Anthropic API key once (stored only in your browser, on your device).
3. Tap **📷 Scan a page**, photograph a log page.
4. Review/fix the rows, scan more pages if you like, then **⬇ Download Excel**.

## How it works
- Static site, no backend. The photo is downscaled in-browser and sent **directly** to the
  Anthropic Messages API (`claude-opus-4-8`, vision + structured output) with the
  `anthropic-dangerous-direct-browser-access` header.
- Your API key lives only in `localStorage` on your device — it is never in this code and never
  sent anywhere except to Anthropic to read your pages.
- Excel export uses [xlsx-js-style](https://github.com/gitbrent/xlsx-js-style) (a styling-capable
  SheetJS fork, vendored in `vendor/`) so the sheet matches the DPR layout: **TIME** centered in
  column A, **TASK DESCRIPTION** merged across B:L and left-anchored, one sheet per day tab-named
  `Weekday.M.D.YYYY`. On phones the file goes to the native share sheet; on desktop it downloads.

## Files
`index.html` · `app.js` · `manifest.webmanifest` · `sw.js` · `icons/` · `vendor/xlsx.bundle.js`

## Hosting
Any static host over HTTPS works (HTTPS is required for the camera and for PWA install). This repo
is set up for **GitHub Pages** — enable Pages on the `main` branch, root folder.
