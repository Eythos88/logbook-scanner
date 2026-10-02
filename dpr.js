/* DPR format rules — pure functions shared by the app (browser) and the tests (node).
   Everything here mirrors the TIME | TASK DESCRIPTION section of the DOUS DPR master book
   (measured from "HD39 DPR Sept.xlsm", sheet Wednesday.9.16.2026). */
(function (root) {
  'use strict';

  const LINE_MAX = 127;            // chars that fit in the merged B:L box before the crew wraps to an XXXX row
  const CONT = 'XXXX';             // time-column marker for a continuation row
  const TIME_FMT = '[hh]:mm';      // master stores times as durations: 00:15 … 24:00

  // master column widths A..L
  const COL_WIDTHS = [9.14, 10.86, 9.71, 9.14, 13, 13, 13, 11.57, 9.14, 9.29, 10.29, 9.14];

  /** "0:15", "00:15", "0015", "15", "24:00" → fraction of a day (Excel time). null if unreadable. */
  function parseTime(s) {
    s = String(s == null ? '' : s).trim();
    let m = s.match(/^(\d{1,2})[:.h]?(\d{2})$/);
    if (!m) { m = s.match(/^(\d{1,2})$/); if (m) m = [s, m[1], '00']; }
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
    return (h * 60 + min) / 1440;
  }

  /** Normalise any readable time to "HH:MM" for display; leave unreadable text untouched. */
  function fmtTime(s) {
    const f = parseTime(s);
    if (f == null) return String(s == null ? '' : s).trim();
    const mins = Math.round(f * 1440);
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  /** Split text into ≤max-char lines on word boundaries (crew convention for long entries). */
  function splitLine(text, max) {
    max = max || LINE_MAX;
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
    const out = [];
    let cur = '';
    for (let w of words) {
      while (w.length > max) {                     // a single "word" longer than the box: hard-cut it
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, max)); w = w.slice(max);
      }
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= max) cur += ' ' + w;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  /** entries [{time, text}] → sheet rows [{time: fraction|string, text}] with XXXX continuations. */
  function toRows(entries) {
    const rows = [];
    for (const e of entries) {
      const lines = splitLine(e.text);
      const t = parseTime(e.time);
      lines.forEach((line, i) => rows.push({ time: i === 0 ? (t == null ? String(e.time || '') : t) : CONT, text: line }));
    }
    return rows;
  }

  /* ---- cell styles copied from the master ---- */
  const FONT = { name: 'Calibri', sz: 10 };
  const FONT_COVERED = { name: 'Arial', sz: 10 };   // master's merged-over cells C:L
  const FILL = { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } };
  const hair = { style: 'hair', color: { rgb: '000000' } };
  const thin = { style: 'thin', color: { rgb: '000000' } };
  const med = { style: 'medium', color: { rgb: '000000' } };

  function styleFor(col) {
    const border = { bottom: hair };
    if (col === 0) { border.left = med; border.right = thin; }
    if (col === 11) border.right = med;
    const s = { font: col < 2 ? FONT : FONT_COVERED, fill: FILL, border };
    if (col === 0) { s.alignment = { horizontal: 'center', vertical: 'top' }; s.numFmt = TIME_FMT; }
    else s.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    return s;
  }

  /** Build the worksheet (rows only, no header) with an xlsx-js-style XLSX object. */
  function buildSheet(XLSX, entries) {
    const rows = toRows(entries);
    const ws = {};
    const merges = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < 12; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        let cell;
        if (c === 0) cell = typeof row.time === 'number'
          ? { t: 'n', v: row.time, z: TIME_FMT }
          : { t: 's', v: row.time };
        else if (c === 1) cell = { t: 's', v: row.text };
        else cell = { t: 's', v: '' };
        cell.s = styleFor(c);
        ws[ref] = cell;
      }
      merges.push({ s: { r, c: 1 }, e: { r, c: 11 } });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: 11 } });
    ws['!merges'] = merges;
    ws['!cols'] = COL_WIDTHS.map(w => ({ width: w }));   // raw Excel width, no padding
    ws['!rows'] = rows.map(() => ({ hpt: 15 }));
    return ws;
  }

  const api = { LINE_MAX, CONT, TIME_FMT, COL_WIDTHS, parseTime, fmtTime, splitLine, toRows, buildSheet };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DPR = api;
})(typeof self !== 'undefined' ? self : this);
