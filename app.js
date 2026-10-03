/* Log Book Scanner — photograph a handwritten ROV log page, transcribe + clean it up with Claude,
   review, and export the TIME | TASK DESCRIPTION rows in the DPR master's exact format.
   Single-user PWA; the API key and all data live only in this browser. */
'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_EDGE = 2000;                   // downscale long edge before upload
const JPEG_Q = 0.85;

const LS_KEY = 'lb_apikey';
const LS_ROWS = 'lb_rows';
const LS_SETTINGS = 'lb_settings';
const LS_VIEW = 'lb_view';

/* ---------- persistence ---------- */
function load(k, dflt){ try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch { setStatus('Storage is full — export and clear old days.', 'err'); } }
function getKey(){ return localStorage.getItem(LS_KEY) || ''; }
function uid(){ return (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function shiftDay(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function todayIso(){ const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }

const settings = Object.assign({ rovs: KB.ROVS.slice(), kb: Object.assign({}, KB.KNOWLEDGE) }, load(LS_SETTINGS, {}));
// New starter master list: replace any section still exactly at the old default; keep Mike's edits.
if (typeof settings.kb.ops !== 'string') settings.kb.ops = KB.KNOWLEDGE.ops;   // section added in seed v3
if ((settings.seed || 1) < KB.SEED_VERSION){
  for (const k of Object.keys(KB.LEGACY_KNOWLEDGE))
    if (settings.kb[k] === KB.LEGACY_KNOWLEDGE[k]) settings.kb[k] = KB.KNOWLEDGE[k];
  settings.seed = KB.SEED_VERSION;
  save(LS_SETTINGS, settings);
}
const view = Object.assign({ day: todayIso(), rov: settings.rovs[0] || '' }, load(LS_VIEW, {}));

// each entry: { id, rov, day, time, raw, text, unclear, note, unknown[] }
let entries = load(LS_ROWS, []).map(e => e.text !== undefined ? e : {     // migrate v1 rows
  id: e.id || uid(), rov: '', day: isoFromAny(e.date) || todayIso(), time: e.time || '',
  raw: e.description || '', text: e.description || '', unclear: false, note: '', unknown: [],
});
function saveEntries(){ save(LS_ROWS, entries); }
function saveSettings(){ save(LS_SETTINGS, settings); }
function saveView(){ save(LS_VIEW, view); }

const $ = (id) => document.getElementById(id);
const els = {};
['setup','app','keyInput','keySave','scanBtn','pickBtn','fileCam','filePick','status','entries','count',
 'addRow','clearDay','exportBtn','changeKey','dayInput','rovSelect','rovSheet','rovChoices','rovCancel',
 'queueBar','queueText','retryBtn','rovList','kbAbbrev','kbField','kbRov','kbTooling','kbOps','kbReset','kbShare','kbImport','kbFile','flagBox','flagTitle','flagList','fixAll','undoFix']
  .forEach(id => els[id] = $(id));

/* ---------- status ---------- */
let statusTimer = null;
function setStatus(msg, kind){
  clearTimeout(statusTimer);
  els.status.className = kind || '';
  els.status.innerHTML = (kind === 'work' ? '<span class="spin"></span>' : '') + esc(msg || '');
  if (kind === 'ok') statusTimer = setTimeout(() => { els.status.textContent = ''; els.status.className = ''; }, 5000);
}

/* ---------- screens ---------- */
function showSetup(prefill){
  els.setup.classList.remove('hidden');
  els.app.classList.add('hidden');
  els.keyInput.value = prefill ? getKey() : '';
  els.keyInput.focus();
}
function showApp(){
  els.setup.classList.add('hidden');
  els.app.classList.remove('hidden');
  renderAll();
}

/* ---------- image handling ---------- */
// Decode with EXIF orientation applied, then downscale. Phones store portrait photos
// rotated behind an EXIF flag; a raw canvas draw would send the page to Claude sideways.
async function loadOrientedBitmap(file){
  if ('createImageBitmap' in window){
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { /* HEIC, or the option is unsupported — fall back to <img> below */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. If it is an iPhone HEIC photo, use the camera button instead of "Choose photo".'));
    };
    img.src = url;
  });
}
async function fileToDownscaledJpeg(file){
  const bmp = await loadOrientedBitmap(file);
  let w = bmp.width, h = bmp.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return cv.toDataURL('image/jpeg', JPEG_Q).split(',')[1];   // base64 payload only
}

/* ---------- offline queue (IndexedDB: photos are too big for localStorage) ---------- */
const DB_NAME = 'logbook', STORE = 'pending';
function db(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function qOp(mode, fn){
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req ? req.result : undefined);
    tx.onerror = () => rej(tx.error);
  });
}
const qAdd = (p) => qOp('readwrite', st => st.put(p));
const qDel = (id) => qOp('readwrite', st => st.delete(id));
const qAll = () => qOp('readonly', st => st.getAll());

async function callClaude(body, emptyMsg){
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: Object.assign({ 'x-api-key': getKey(), 'anthropic-dangerous-direct-browser-access': 'true' }, PROMPT.HEADERS),
    body: JSON.stringify(body),
  });
  if (!res.ok){
    let detail = `HTTP ${res.status}`;
    try { const e = await res.json(); detail = e.error?.message || detail; } catch {}
    if (res.status === 401) detail = 'API key was rejected. Check it under Settings → Change API key.';
    const err = new Error(detail); err.retryable = res.status === 429 || res.status >= 500; throw err;
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('The model declined this request.');
  if (data.stop_reason === 'max_tokens')
    throw new Error('That page had too many entries to read in one pass. Photograph the top half and bottom half separately.');
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error(emptyMsg);
  try { return JSON.parse(textBlock.text); }
  catch { throw new Error(emptyMsg); }
}

async function readPage(base64, rov, day){
  const out = await callClaude(PROMPT.buildRequest({
    base64, rov, day, earlier: dayEntries(day, rov), previousDay: dayEntries(shiftDay(day, -1), rov).slice(-12),
    kb: settings.kb, styleExamples: KB.STYLE_EXAMPLES,
  }), 'Could not read the transcription — try a clearer, straighter photo.');
  return out.rows || [];
}

async function shortenLine(e){
  const list = dayEntries(e.day, e.rov), i = list.indexOf(e);
  const out = await callClaude(PROMPT.buildShortenRequest({
    line: e.text, before: list[i - 1]?.text, after: list[i + 1]?.text, kb: settings.kb, styleExamples: KB.STYLE_EXAMPLES,
  }), 'No shorter version came back — try again.');
  return String(out.text || '').trim();
}

/* ---------- scan flow: pick ROV → photo → queue → process ---------- */
let pendingRov = null;
let pickMode = 'cam';
function openRovSheet(mode){
  pickMode = mode;
  els.rovChoices.innerHTML = '';
  for (const r of settings.rovs){
    const b = document.createElement('button');
    b.className = 'rov-choice' + (r === view.rov ? ' current' : '');
    b.textContent = r;
    b.addEventListener('click', () => {
      pendingRov = r;
      closeRovSheet();
      (pickMode === 'cam' ? els.fileCam : els.filePick).click();   // must stay inside the tap for iOS
    });
    els.rovChoices.appendChild(b);
  }
  els.rovSheet.classList.remove('hidden');
}
function closeRovSheet(){ els.rovSheet.classList.add('hidden'); }

async function handleFile(file){
  if (!file || !pendingRov) return;
  if (!getKey()){ showSetup(false); return; }
  const rov = pendingRov, day = view.day;
  try {
    setStatus('Preparing image…', 'work');
    const b64 = await fileToDownscaledJpeg(file);
    await qAdd({ id: uid(), rov, day, b64, added: Date.now() });   // saved first, so nothing is lost offline
    view.rov = rov; saveView();
    renderAll();
    processQueue();
  } catch (err){
    setStatus(err.message || 'Something went wrong.', 'err');
  }
}

let processing = false;
async function processQueue(){
  if (processing) return;
  processing = true;
  try {
    let pending = (await qAll()).sort((a, b) => a.added - b.added);
    while (pending.length){
      if (!navigator.onLine){ setStatus('No connection — photos are saved and will send when you are back online.', 'err'); break; }
      const p = pending[0];
      setStatus(`Reading ${p.rov} page… (${pending.length} waiting)`, 'work');
      let rows;
      try { rows = await readPage(p.b64, p.rov, p.day); }
      catch (err){
        const offline = err instanceof TypeError;            // fetch network failure
        setStatus(offline ? 'Connection dropped — photo saved, tap Retry when you have signal.'
                          : (err.message || 'Something went wrong.'), 'err');
        if (!offline && !err.retryable) await qDel(p.id);    // bad image / refusal: don't loop on it
        break;
      }
      const added = rows.map(r => ({
        id: uid(), rov: p.rov, day: p.day, time: DPR.fmtTime(r.time), raw: (r.raw || '').trim(),
        text: (r.clean || '').trim(), unclear: !!r.unclear, note: (r.note || '').trim(),
        unknown: (r.unknown_terms || []).filter(Boolean),
        fixText: (r.fix_text || '').trim(), fixTime: DPR.parseTime(r.fix_time) == null ? '' : DPR.fmtTime(r.fix_time),
        termSugg: (r.term_suggestions || []).filter(s => s && s.term),
        op: (r.operation || '').trim(), step: Number(r.step) || 0, asset: (r.asset || '').trim(),
        parts: Array.isArray(r.milestone_parts) ? r.milestone_parts.map(Number).filter(n => n > 0) : null,
      }));
      entries.push(...added); saveEntries();
      await qDel(p.id);
      pending = pending.slice(1);
      renderAll();
      const checks = added.filter(e => e.unclear || e.unknown.length).length;
      setStatus(`Added ${added.length} line${added.length === 1 ? '' : 's'}` +
        (checks ? ` — ${checks} flagged to check.` : '. Review below.'), added.length ? 'ok' : 'err');
    }
  } finally {
    processing = false;
    renderQueue();
  }
}
async function renderQueue(){
  let n = 0; try { n = (await qAll()).length; } catch {}
  els.queueBar.classList.toggle('hidden', n === 0 || processing);
  els.queueText.textContent = `${n} photo${n === 1 ? '' : 's'} waiting to send`;
}

/* ---------- entries UI ---------- */
function dayEntries(day, rov){ return entries.filter(e => e.day === day && e.rov === rov); }

function renderAll(){
  // ROV filter: configured ROVs plus any that already have entries
  const rovs = Array.from(new Set(settings.rovs.concat(entries.map(e => e.rov).filter(Boolean))));
  if (!rovs.includes(view.rov)) view.rov = rovs[0] || '';
  els.rovSelect.innerHTML = rovs.map(r => `<option${r === view.rov ? ' selected' : ''}>${esc(r)}</option>`).join('');
  els.dayInput.value = view.day;
  renderEntries();
  renderQueue();
  els.exportBtn.textContent = `Export ${view.rov || ''} ${sheetName(view.day)} to Excel`;
}

// unknown terms stop being flagged once they've been added to the master list
function stillUnknown(e){
  const kb = Object.values(settings.kb).join('\n').toLowerCase();
  const re = (t) => new RegExp('^\\s*' + t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=', 'm');
  return (e.unknown || []).filter(t => !re(t).test(kb));
}
/** Every flag on a line → [{ text, kind, soft }]. kind 'unclear' / 'unknown' can be dismissed. */
function flagsFor(e, outOfOrder){
  const f = [];
  const pm = partials.get(e.id);
  if (pm && !(e.dismissed || []).includes('partial'))
    f.push({ kind: 'partial', text: `${pm.asset}: milestone ${pm.step} incomplete — not logged: ` +
      pm.missing.map(x => `“${fillStep(x.p, pm.asset, pm.rov)}”`).join(', ') });
  const g = gaps.get(e.id);
  if (g && !(e.dismissed || []).includes('gap')){
    const names = g.gap.map(x => `milestone ${x.step} — “${fillStep(x.text, g.asset, g.rov)}”`).join(', ');
    f.push({ kind: 'gap', text: `${g.asset}: missing ${names}` });
  }
  const unk = stillUnknown(e);
  if (e.unclear) f.push({ kind: 'unclear', text: `Check: ${e.note || 'part of this was hard to read'}` });
  if (unk.length) f.push({ kind: 'unknown', text: `Not in master list: ${unk.join(', ')}` });
  if (outOfOrder) f.push({ kind: 'order', text: 'Time is earlier than the line above' });
  if (DPR.parseTime(e.time) == null) f.push({ kind: 'time', text: 'Time not readable' });
  if (e.text.trim().length > DPR.LINE_MAX) f.push({ kind: 'long', soft: true, text: 'Over the line limit — exports as an XXXX continuation row' });
  return f;
}

/* ---------- operation milestones: missing milestones ---------- */
/** "## Mattress installation — asset: …" + "1. …" lines → Map(name → [step text, …]) */
function parsePlaybooks(text){
  const books = new Map(); let cur = null;
  for (const line of String(text || '').split('\n')){
    const h = line.match(/^\s*##\s*([^—\-]+?)\s*(?:[—\-].*)?$/);
    if (h){ cur = []; books.set(h[1].trim().toLowerCase(), cur); continue; }
    const st = line.match(/^\s*(\d+)[.)]\s*(.+)$/);
    if (cur && st) cur[+st[1] - 1] = st[2].trim();
  }
  return books;
}
/** For the day's lines: entry id → [{ step, text }] of milestones missing just before that line. */
function missingSteps(list){
  const books = parsePlaybooks(settings.kb.ops);
  const out = new Map();
  const cycles = new Map();                       // "op|asset" → [entries in order]
  for (const e of list){
    if (!e.op || !e.asset || !e.step) continue;
    const k = e.op.toLowerCase() + '|' + e.asset.toUpperCase();
    if (!cycles.has(k)) cycles.set(k, []);
    cycles.get(k).push(e);
  }
  for (const [k, es] of cycles){
    const steps = books.get(k.split('|')[0]); if (!steps) continue;
    const seen = new Set(es.map(e => e.step));
    for (let i = 1; i < es.length; i++){
      const gap = [];
      for (let s = es[i - 1].step + 1; s < es[i].step; s++) if (!seen.has(s) && steps[s - 1]) gap.push({ step: s, text: steps[s - 1] });
      if (gap.length) out.set(es[i].id, { gap, asset: es[i].asset, rov: es[i].rov, after: es[i - 1] });
    }
  }
  return out;
}
const fillStep = (t, asset, rov) => t.replace(/\{ID\}/g, asset).replace(/\{ROV\}/g, rov);
/** "A; B; C." → ["A", "B", "C"] */
const milestoneParts = (t) => String(t || '').replace(/\.\s*$/, '').split(';').map(s => s.trim()).filter(Boolean);
/** entry id → { missing: [part text], asset, rov } for milestones logged only in part (flag goes on the milestone's last line). */
function incompleteMilestones(list){
  const books = parsePlaybooks(settings.kb.ops);
  const groups = new Map();                       // "op|asset|step" → [entries]
  for (const e of list){
    if (!e.op || !e.asset || !e.step || !Array.isArray(e.parts)) continue;   // lines read before parts existed: skip
    const k = `${e.op.toLowerCase()}|${e.asset.toUpperCase()}|${e.step}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const out = new Map();
  for (const [k, es] of groups){
    const [op, , step] = k.split('|');
    const text = (books.get(op) || [])[+step - 1]; if (!text) continue;
    const parts = milestoneParts(text);
    const covered = new Set(es.flatMap(e => e.parts));
    const missing = parts.map((p, i) => ({ n: i + 1, p })).filter(x => !covered.has(x.n));
    const last = es[es.length - 1];
    if (missing.length) out.set(last.id, { missing, asset: last.asset, rov: last.rov, step: +step });
  }
  return out;
}

let cardState = new Map();   // entry id → { e, card, outOfOrder, paint }
let gaps = new Map();        // entry id → milestones missing just before it
let partials = new Map();    // entry id → parts of its milestone not logged

function renderEntries(){
  const list = dayEntries(view.day, view.rov);
  els.count.textContent = `${list.length} line${list.length === 1 ? '' : 's'}`;
  cardState = new Map();
  gaps = missingSteps(list);
  partials = incompleteMilestones(list);
  if (list.length === 0){
    els.entries.innerHTML = '<div class="empty">No lines for this ROV and day yet. Tap Scan a page.</div>';
    renderFlagSummary();
    return;
  }
  els.entries.innerHTML = '';
  let prevT = -1;
  for (const e of list){
    const t = DPR.parseTime(e.time);
    const outOfOrder = t != null && t < prevT;
    if (t != null) prevT = t;

    const card = document.createElement('div');
    card.className = 'entry';
    card.id = 'line-' + e.id;
    card.innerHTML =
      '<div class="top">' +
        `<input class="time" type="text" inputmode="numeric" placeholder="HH:MM" value="${esc(e.time)}" aria-label="Time">` +
        '<span class="len"></span>' +
        '<button class="del" aria-label="Delete line">×</button>' +
      '</div>' +
      `<textarea rows="2" placeholder="Task description" aria-label="Task description">${esc(e.text)}</textarea>` +
      '<div class="flags"></div>' +
      (e.raw ? `<details class="raw"><summary>Handwritten</summary><p>${esc(e.raw)}</p></details>` : '');
    const timeI = card.querySelector('.time');
    const descT = card.querySelector('textarea');
    const len = card.querySelector('.len');
    const flags = card.querySelector('.flags');

    const paint = () => {
      const n = descT.value.trim().length;
      len.textContent = `${n}/${DPR.LINE_MAX}`;
      len.className = 'len' + (n > DPR.LINE_MAX ? ' over' : '');
      const f = flagsFor(e, outOfOrder);
      flags.innerHTML = f.map(x => `<span class="flag${x.soft ? ' soft' : ''}">${esc(x.text)}</span>`).join('');
      card.classList.toggle('flagged', f.some(x => !x.soft));
    };
    timeI.addEventListener('change', () => { e.time = DPR.fmtTime(timeI.value); timeI.value = e.time; saveEntries(); renderEntries(); });
    descT.addEventListener('input', () => { e.text = descT.value; autogrow(descT); paint(); saveEntries(); renderFlagSummary(); });
    card.querySelector('.del').addEventListener('click', () => {
      entries = entries.filter(x => x.id !== e.id); saveEntries(); renderEntries();
    });
    // reviewing a flagged line and editing it clears the "unclear" flag
    descT.addEventListener('change', () => { if (e.unclear){ e.unclear = false; saveEntries(); paint(); renderFlagSummary(); } });
    els.entries.appendChild(card);
    cardState.set(e.id, { e, card, outOfOrder, paint });
    paint();
  }
  renderFlagSummary();
  regrowAll();
}

/* ---------- recommended fixes ---------- */
const GROUP_HEADER = {   // must match the headers in knowledge.js so a new term lands in the right group
  keep: '# KEEP as abbreviations — equipment, systems and documents.',
  write_out: '# WRITE OUT in full — operational shorthand.',
};
/** → { rec, btn, ai, apply() } or null. apply() changes the data; caller saves + re-renders. */
function fixFor(e, f){
  const list = () => dayEntries(e.day, e.rov);
  if (f.kind === 'unclear'){
    const parts = [];
    if (e.fixText && e.fixText !== e.text) parts.push(`“${e.fixText}”`);
    if (e.fixTime && e.fixTime !== e.time) parts.push(`time ${e.fixTime}`);
    if (!parts.length) return { rec: 'Compare with the handwriting below the line, then tap OK.' };
    return { rec: 'Suggested reading: ' + parts.join(', '), btn: 'Apply', apply(){
      if (e.fixText) e.text = e.fixText;
      if (e.fixTime) e.time = e.fixTime;
      e.unclear = false;
    } };
  }
  if (f.kind === 'unknown'){
    const terms = stillUnknown(e).map(t => (e.termSugg || []).find(s => s.term.toLowerCase() === t.toLowerCase()) || { term: t, meaning: '?', group: 'keep' });
    const desc = terms.map(s => `${s.term} = ${s.meaning}${s.meaning.trim().startsWith('?') ? '' : (s.group === 'write_out' ? ' (write out)' : ' (keep short)')}`).join('; ');
    return { rec: `Add to master list: ${desc}` + (terms.some(s => s.meaning.trim().startsWith('?')) ? ' — fill in the meaning in Settings' : ''),
      btn: 'Add', apply(){
        for (const s of terms){
          const r = KBMERGE.mergeSection(settings.kb.abbrev, `${GROUP_HEADER[s.group] || GROUP_HEADER.keep}\n${s.term} = ${s.meaning || '?'}`);
          settings.kb.abbrev = r.text;
        }
        saveSettings(); renderSettings();
      } };
  }
  if (f.kind === 'partial'){
    const pm = partials.get(e.id);
    const add = pm.missing.map(x => fillStep(x.p, pm.asset, pm.rov));
    const next = e.text.replace(/\.\s*$/, '') + '; ' + add.join('; ') + '.';
    return { rec: `Add to this line: “${next}”. Or tap OK if it really wasn’t done.`, btn: 'Add', apply(){
      e.text = next;
      e.parts = Array.from(new Set((e.parts || []).concat(pm.missing.map(x => x.n)))).sort((a, b) => a - b);
    } };
  }
  if (f.kind === 'gap'){
    const g = gaps.get(e.id);
    const lines = g.gap.map(x => fillStep(x.text, g.asset, g.rov));
    return { rec: `Insert ${lines.length === 1 ? 'the missing line' : lines.length + ' missing lines'} between ${g.after.time || '?'} and ${e.time || '?'}: ` +
      lines.map(l => `“${l}”`).join(' ') + ' — then type the time from your log. Or tap OK if it really wasn’t done.',
      btn: 'Insert', apply(){
        const at = entries.indexOf(e);
        const add = g.gap.map(x => ({ id: uid(), rov: e.rov, day: e.day, time: '', raw: '', text: fillStep(x.text, g.asset, g.rov),
          unclear: false, note: '', unknown: [], op: e.op, step: x.step, asset: g.asset,
          parts: milestoneParts(x.text).map((_, i) => i + 1) }));
        entries.splice(at, 0, ...add);
      } };
  }
  if (f.kind === 'order'){
    if (e.fixTime && e.fixTime !== e.time) return { rec: `Time may be misread — suggested ${e.fixTime}. Or move the line into time order.`, btn: `Use ${e.fixTime}`, apply(){ e.time = e.fixTime; } };
    return { rec: 'Move this line into time order.', btn: 'Move', apply(){
      const t = DPR.parseTime(e.time);
      entries = entries.filter(x => x !== e);
      const later = entries.find(x => x.day === e.day && x.rov === e.rov && DPR.parseTime(x.time) != null && DPR.parseTime(x.time) > t);
      entries.splice(later ? entries.indexOf(later) : entries.length, 0, e);
    } };
  }
  if (f.kind === 'time'){
    if (e.fixTime) return { rec: `Suggested time: ${e.fixTime}`, btn: 'Apply', apply(){ e.time = e.fixTime; } };
    return { rec: 'Type the time from the handwriting into the line below.' };
  }
  if (f.kind === 'long'){
    return { rec: `Shorten to fit one line (${DPR.LINE_MAX} characters), keeping every fact.`, btn: 'Shorten', ai: true, async apply(){
      const s = await shortenLine(e);
      if (!s) throw new Error('No shorter version came back.');
      e.text = s;
    } };
  }
  return null;
}

let undoSnap = null;           // { entries, kb, label } — one level of undo for the last fix
function snapshot(label){ undoSnap = { entries: JSON.stringify(entries), kb: JSON.stringify(settings.kb), label }; }
function undoFix(){
  if (!undoSnap) return;
  entries = JSON.parse(undoSnap.entries); settings.kb = JSON.parse(undoSnap.kb);
  undoSnap = null; saveEntries(); saveSettings(); renderSettings(); renderEntries();
  setStatus('Fix undone.', 'ok');
}
async function runFix(fx, label){
  snapshot(label);
  try {
    if (fx.ai) setStatus('Asking Claude for a shorter line…', 'work');
    await fx.apply();
    saveEntries(); renderEntries();
    setStatus(`Fixed: ${label}`, 'ok');
  } catch (err){
    undoSnap = null;
    renderFlagSummary();       // reset the button so the fix can be tried again
    setStatus(err instanceof TypeError ? 'No connection — try the fix again when you have signal.' : (err.message || 'Fix failed.'), 'err');
  }
}
async function applyAll(){
  const todo = [];
  for (const { e, outOfOrder } of cardState.values())
    for (const f of flagsFor(e, outOfOrder)){ const fx = fixFor(e, f); if (fx && fx.btn) todo.push({ e, f, fx }); }
  if (!todo.length) return;
  const ai = todo.filter(t => t.fx.ai).length;
  if (!confirm(`Apply ${todo.length} suggested fix${todo.length === 1 ? '' : 'es'}?` + (ai ? `\n\n${ai} of them ask Claude to shorten a line (needs signal).` : '') + '\n\nYou can undo this in one tap.')) return;
  snapshot('all fixes');
  let done = 0, failed = 0, why = '';
  // moves last, so line order settles after times are fixed
  todo.sort((x, y) => (x.f.kind === 'order') - (y.f.kind === 'order'));
  for (const t of todo){
    try {
      if (t.f.kind === 'order' && !flagsFor(t.e, cardState.get(t.e.id)?.outOfOrder).some(f => f.kind === 'order')) continue;
      if (t.fx.ai) setStatus(`Shortening line ${t.e.time}…`, 'work');
      await t.fx.apply(); done++;
    } catch (err){ failed++; why = err instanceof TypeError ? 'no connection' : (err.message || 'unknown error'); }
  }
  saveEntries(); renderEntries();
  setStatus(`Applied ${done} fix${done === 1 ? '' : 'es'}` + (failed ? `; ${failed} could not be done (${why}).` : '.'), failed ? 'err' : 'ok');
}

/* ---------- flag summary box (top of page) ---------- */
function renderFlagSummary(){
  const items = [];
  for (const { e, outOfOrder } of cardState.values())
    for (const f of flagsFor(e, outOfOrder)) items.push({ e, f });
  const hard = items.filter(x => !x.f.soft), soft = items.filter(x => x.f.soft);
  const lines = cardState.size;
  if (!lines){ els.flagBox.classList.add('hidden'); return; }
  if (!items.length) els.fixAll.classList.add('hidden');
  els.flagBox.classList.remove('hidden');
  els.flagBox.classList.toggle('clear', hard.length === 0);
  const nLines = new Set(hard.map(x => x.e.id)).size;
  els.flagTitle.textContent = hard.length
    ? `${hard.length} flag${hard.length === 1 ? '' : 's'} on ${nLines} line${nLines === 1 ? '' : 's'} to check`
    : `All ${lines} line${lines === 1 ? '' : 's'} clear`;
  const fixable = items.filter(x => { const fx = fixFor(x.e, x.f); return fx && fx.btn; }).length;
  els.fixAll.classList.toggle('hidden', fixable < 2);
  els.fixAll.textContent = `Apply all ${fixable} fixes`;
  els.undoFix.classList.toggle('hidden', !undoSnap);
  els.flagList.innerHTML = '';
  for (const { e, f } of hard.concat(soft)){
    const li = document.createElement('li');
    li.className = f.soft ? 'soft' : '';
    const fx = fixFor(e, f);
    li.innerHTML = `<button class="flag-go"><span class="flag-time">${esc(e.time || '--:--')}</span>` +
      `<span class="flag-why">${esc(f.text)}</span><span class="flag-line">${esc(e.text.slice(0, 60))}${e.text.length > 60 ? '…' : ''}</span></button>` +
      '<div class="flag-acts">' +
        (fx && fx.btn ? `<button class="flag-fix">${esc(fx.btn)}</button>` : '') +
        (['unclear', 'unknown', 'gap', 'partial'].includes(f.kind) ? '<button class="flag-ok" aria-label="Mark as checked">OK</button>' : '') +
      '</div>' +
      (fx ? `<p class="flag-rec">${esc(fx.rec)}</p>` : '');
    li.querySelector('.flag-go').addEventListener('click', () => {
      const st = cardState.get(e.id); if (!st) return;
      st.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      st.card.classList.remove('pulse'); void st.card.offsetWidth; st.card.classList.add('pulse');
      setTimeout(() => st.card.querySelector('textarea').focus({ preventScroll: true }), 350);
    });
    const fixBtn = li.querySelector('.flag-fix');
    if (fixBtn) fixBtn.addEventListener('click', async () => {
      fixBtn.disabled = true; fixBtn.textContent = fx.ai ? 'Working…' : fixBtn.textContent;
      await runFix(fx, `${e.time} ${f.text}`);
    });
    const ok = li.querySelector('.flag-ok');
    if (ok) ok.addEventListener('click', () => {
      if (f.kind === 'unclear') e.unclear = false;
      else if (f.kind === 'gap' || f.kind === 'partial') e.dismissed = (e.dismissed || []).concat(f.kind);
      else e.unknown = [];
      saveEntries(); cardState.get(e.id)?.paint(); renderFlagSummary();
    });
    els.flagList.appendChild(li);
  }
}
function autogrow(t){ t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
// first layout happens after render (and fonts can reflow it), so size every box again once it has
function regrowAll(){ requestAnimationFrame(() => els.entries.querySelectorAll('textarea').forEach(autogrow)); }
window.addEventListener('resize', regrowAll);
if (document.fonts) document.fonts.ready.then(regrowAll);
function esc(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- settings: ROV list + master list ---------- */
function renderSettings(){
  els.rovList.value = settings.rovs.join(', ');
  els.kbAbbrev.value = settings.kb.abbrev;
  els.kbField.value = settings.kb.field;
  els.kbRov.value = settings.kb.rov;
  els.kbTooling.value = settings.kb.tooling;
  els.kbOps.value = settings.kb.ops;
}
function bindKb(el, key){
  el.addEventListener('input', () => { settings.kb[key] = el.value; saveSettings(); });
  el.addEventListener('change', renderEntries);    // a newly added term clears its "not in master list" flags
}

/* ---------- share / import the master list (file passed phone to phone — never online) ---------- */
const KB_FILE_TYPE = 'logbook-master-list';
const KB_KEYS = ['abbrev', 'field', 'rov', 'tooling', 'ops'];

async function shareKb(){
  const data = { type: KB_FILE_TYPE, version: 1, exported: new Date().toISOString(), rovs: settings.rovs, kb: settings.kb };
  const fname = `master-list-${todayIso()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], fname, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: 'DPR master list' }); setStatus('Master list shared.', 'ok'); return; }
    catch (e){ if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus(`${fname} saved — send it to the other phone.`, 'ok');
}

async function importKb(file){
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (!data || data.type !== KB_FILE_TYPE || !data.kb || !KB_KEYS.filter(k => k !== 'ops').every(k => typeof data.kb[k] === 'string')){   // lists shared before milestones existed have no ops
    setStatus('That file is not a master list from this app.', 'err'); return;
  }
  // merge theirs INTO mine: add what I'm missing, fill my "?" terms, never overwrite my meanings
  const merged = {}, added = [], filled = [], conflicts = [];
  for (const k of KB_KEYS){
    const r = KBMERGE.mergeSection(settings.kb[k], data.kb[k] || '');
    merged[k] = r.text;
    r.added.forEach(l => added.push(l)); r.filled.forEach(l => filled.push(l));
    r.conflicts.forEach(c => conflicts.push(c));
  }
  const rv = KBMERGE.mergeRovs(settings.rovs, Array.isArray(data.rovs) ? data.rovs : []);
  if (!added.length && !filled.length && !rv.added.length){
    setStatus(conflicts.length ? `Nothing new to add. ${conflicts.length === 1 ? '1 term differs' : conflicts.length + ' terms differ'} — yours kept.` : 'Nothing new — you already have everything in that list.', 'ok');
    if (conflicts.length) alert(conflictText(conflicts));
    return;
  }
  const list = (arr, max) => arr.slice(0, max).map(l => '  + ' + l).join('\n') + (arr.length > max ? `\n  …and ${arr.length - max} more` : '');
  const parts = [];
  if (added.length) parts.push(`Add ${added.length} new:\n${list(added, 8)}`);
  if (filled.length) parts.push(`Fill in ${filled.length} you had as "?":\n${list(filled, 5)}`);
  if (rv.added.length) parts.push(`Add ROV${rv.added.length === 1 ? '' : 's'}: ${rv.added.join(', ')}`);
  if (conflicts.length) parts.push(`${conflicts.length === 1 ? '1 term differs' : conflicts.length + ' terms differ'} — yours will be kept (listed after).`);
  if (!confirm(`Add from the shared list?\n\n${parts.join('\n\n')}\n\nNothing you already have is changed.`)) return;
  for (const k of KB_KEYS) settings.kb[k] = merged[k];
  settings.rovs = rv.rovs;
  settings.seed = KB.SEED_VERSION;                       // a merged list is never auto-replaced by a new starter list
  saveSettings(); renderSettings(); renderAll();
  setStatus(`Added ${added.length + filled.length} term${added.length + filled.length === 1 ? '' : 's'}` + (rv.added.length ? ` and ${rv.added.length} ROV${rv.added.length === 1 ? '' : 's'}.` : '.'), 'ok');
  if (conflicts.length) alert(conflictText(conflicts));
}
function conflictText(conflicts){
  return 'These terms mean something different on their list. Yours were kept — edit them in Settings if theirs is right:\n\n' +
    conflicts.slice(0, 10).map(c => `${c.term}\n  yours:  ${c.mine}\n  theirs: ${c.theirs}`).join('\n\n') +
    (conflicts.length > 10 ? `\n\n…and ${conflicts.length - 10} more` : '');
}

/* ---------- export: rows only, master format ---------- */
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function isoFromAny(s){
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);     // M.D.YYYY (US order, like the DPR tabs)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return '';
}
function sheetName(iso){
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Undated';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${WEEKDAYS[d.getDay()]}.${d.getMonth() + 1}.${d.getDate()}.${d.getFullYear()}`;   // DPR tab name
}

async function exportXlsx(){
  const list = dayEntries(view.day, view.rov).filter(e => e.text.trim() || e.time.trim());
  if (list.length === 0){ setStatus('Nothing to export for this ROV and day.', 'err'); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, DPR.buildSheet(XLSX, list), sheetName(view.day).slice(0, 31));
  const fname = `${view.rov} ${sheetName(view.day)}.xlsx`.trim();
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const file = new File([blob], fname, { type: blob.type });
  // Phones: hand off to the share sheet (Save to Files / email) — iOS PWAs block
  // programmatic downloads. Desktop: a normal download. Only claim success on the path that ran.
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: fname }); setStatus('Shared — save it to Files, email, etc.', 'ok'); return; }
    catch (e){ if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus(`${fname} downloaded.`, 'ok');
}

/* ---------- wire up ---------- */
els.keySave.addEventListener('click', () => {
  const k = els.keyInput.value.trim();
  if (!k){ els.keyInput.focus(); return; }
  localStorage.setItem(LS_KEY, k);
  showApp();
  setStatus('Key saved. Scan a page to begin.', 'ok');
});
els.keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') els.keySave.click(); });
els.changeKey.addEventListener('click', () => showSetup(true));
els.scanBtn.addEventListener('click', () => openRovSheet('cam'));
els.pickBtn.addEventListener('click', () => openRovSheet('pick'));
els.rovCancel.addEventListener('click', closeRovSheet);
els.rovSheet.addEventListener('click', e => { if (e.target === els.rovSheet) closeRovSheet(); });
els.fileCam.addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
els.filePick.addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
els.retryBtn.addEventListener('click', processQueue);
window.addEventListener('online', processQueue);
els.dayInput.addEventListener('change', () => { view.day = els.dayInput.value || todayIso(); saveView(); renderAll(); });
els.rovSelect.addEventListener('change', () => { view.rov = els.rovSelect.value; saveView(); renderAll(); });
els.addRow.addEventListener('click', () => {
  entries.push({ id: uid(), rov: view.rov, day: view.day, time: '', raw: '', text: '', unclear: false, note: '', unknown: [] });
  saveEntries(); renderEntries();
  els.entries.lastElementChild?.querySelector('.time')?.focus();
});
els.clearDay.addEventListener('click', () => {
  const n = dayEntries(view.day, view.rov).length;
  if (n && confirm(`Delete all ${n} lines for ${view.rov} on ${sheetName(view.day)}? This cannot be undone.`)){
    entries = entries.filter(e => !(e.day === view.day && e.rov === view.rov));
    saveEntries(); renderEntries(); setStatus('Cleared.', 'ok');
  }
});
els.exportBtn.addEventListener('click', exportXlsx);
els.fixAll.addEventListener('click', applyAll);
els.undoFix.addEventListener('click', undoFix);
els.rovList.addEventListener('change', () => {
  settings.rovs = els.rovList.value.split(/[,\n]/).map(s => s.trim().toUpperCase()).filter(Boolean);
  saveSettings(); renderSettings(); renderAll();
});
bindKb(els.kbAbbrev, 'abbrev'); bindKb(els.kbField, 'field'); bindKb(els.kbRov, 'rov'); bindKb(els.kbTooling, 'tooling'); bindKb(els.kbOps, 'ops');
els.kbShare.addEventListener('click', shareKb);
els.kbImport.addEventListener('click', () => els.kbFile.click());
els.kbFile.addEventListener('change', e => { importKb(e.target.files[0]); e.target.value = ''; });
els.kbReset.addEventListener('click', () => {
  if (confirm('Reset the master list to the starter version? Your edits will be lost.')){
    settings.kb = Object.assign({}, KB.KNOWLEDGE); saveSettings(); renderSettings();
  }
});

/* ---------- boot ---------- */
renderSettings();
if (getKey()){ showApp(); processQueue(); } else showSetup(false);
window.__appBooted = true;   // checked by the self-heal script in index.html
sessionStorage.removeItem('lb_healed');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
