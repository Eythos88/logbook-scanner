/* Merge a crew-mate's master list INTO mine — add what I'm missing, never overwrite what I have.
   Shared by the app (browser) and test/merge.test.js (node).

   A section is lines of text. "TERM = meaning" lines are terms; "# ..." lines are group headers;
   anything else is a free knowledge line. Rules:
   - their term I don't have      → added, at the end of the same-named group in mine (else the end)
   - my term is "?", theirs known → my meaning is filled in from theirs
   - both known, different        → mine is kept; reported as a conflict for me to decide
   - their free line I don't have → added (compared ignoring case and spacing)               */
(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const isHeader = (l) => /^\s*#/.test(l);

  function parseLine(line) {
    const i = line.indexOf('=');
    if (i < 1 || isHeader(line)) return null;
    return { key: norm(line.slice(0, i)), term: line.slice(0, i).trim(), meaning: line.slice(i + 1).trim() };
  }
  const unknown = (m) => /^\?/.test(String(m || '').trim());   // "?" or "? (note)"

  /** → { text, added: [line], filled: [line], conflicts: [{term, mine, theirs}] } */
  function mergeSection(mineText, theirText) {
    const mine = String(mineText || '').split('\n');
    const theirs = String(theirText || '').split('\n');
    const added = [], filled = [], conflicts = [];

    const termIndex = () => { const m = new Map(); mine.forEach((l, i) => { const p = parseLine(l); if (p) m.set(p.key, i); }); return m; };
    const freeSet = new Set(mine.filter(l => !parseLine(l) && !isHeader(l) && l.trim()).map(norm));

    // where to insert a line that belongs under header h (end of that group in mine, else end of text)
    const insertAt = (h) => {
      if (h != null) {
        const hi = mine.findIndex(l => isHeader(l) && norm(l) === norm(h));
        if (hi >= 0) {
          let j = hi + 1;
          while (j < mine.length && !isHeader(mine[j])) j++;
          while (j > hi + 1 && !mine[j - 1].trim()) j--;          // before the blank line that ends the group
          return j;
        }
      }
      let j = mine.length;
      while (j > 0 && !mine[j - 1].trim()) j--;
      if (h != null) {                       // their group is new to me: bring its header along
        mine.splice(j, 0, '', h.trim()); return j + 2;
      }
      return j;
    };

    let header = null;
    for (const line of theirs) {
      if (isHeader(line)) { header = line; continue; }
      if (!line.trim()) continue;
      const p = parseLine(line);
      if (p) {
        const idx = termIndex();
        if (!idx.has(p.key)) { mine.splice(insertAt(header), 0, line.trim()); added.push(line.trim()); continue; }
        const cur = parseLine(mine[idx.get(p.key)]);
        if (norm(cur.meaning) === norm(p.meaning) || unknown(p.meaning)) continue;
        if (unknown(cur.meaning)) {
          mine[idx.get(p.key)] = `${cur.term} = ${p.meaning}`;
          filled.push(mine[idx.get(p.key)]);
        } else conflicts.push({ term: cur.term, mine: cur.meaning, theirs: p.meaning });
      } else if (!freeSet.has(norm(line))) {
        mine.splice(insertAt(header), 0, line.trim()); freeSet.add(norm(line)); added.push(line.trim());
      }
    }
    return { text: mine.join('\n'), added, filled, conflicts };
  }

  function mergeRovs(mine, theirs) {
    const out = mine.slice(), added = [];
    for (const r of theirs || []) { const v = String(r).trim().toUpperCase(); if (v && !out.includes(v)) { out.push(v); added.push(v); } }
    return { rovs: out, added };
  }

  const api = { mergeSection, mergeRovs };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBMERGE = api;
})(typeof self !== 'undefined' ? self : this);
