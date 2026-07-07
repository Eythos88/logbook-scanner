/* Log Book Scanner — photograph a handwritten log page, transcribe with Claude vision,
   edit, and export to Excel. Single-user PWA; the API key lives only in this browser. */
'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';        // vision-capable; best accuracy on real handwriting
const MAX_EDGE = 2000;                   // downscale long edge before upload (Opus 4.8 supports up to 2576)
const JPEG_Q = 0.85;

const LS_KEY = 'lb_apikey';
const LS_ROWS = 'lb_rows';

// each entry: { id, date, time, description }
let entries = load(LS_ROWS, []);

const $ = (id) => document.getElementById(id);
const els = {};
['setup','app','keyInput','keySave','scanBtn','pickBtn','fileCam','filePick','status',
 'entries','count','addRow','clearAll','exportBtn','changeKey'].forEach(id => els[id] = $(id));

/* ---------- persistence ---------- */
function load(k, dflt){ try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function getKey(){ return localStorage.getItem(LS_KEY) || ''; }
function saveEntries(){ save(LS_ROWS, entries); els.count.textContent = `${entries.length} row${entries.length===1?'':'s'}`; }
function uid(){ return (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

/* ---------- status ---------- */
let statusTimer = null;
function setStatus(msg, kind){
  clearTimeout(statusTimer);
  els.status.className = kind || '';
  els.status.innerHTML = (kind === 'work' ? '<span class="spin"></span>' : '') + (msg || '');
  if (kind === 'ok') statusTimer = setTimeout(() => { els.status.textContent=''; els.status.className=''; }, 4000);
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
  renderEntries();
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
      reject(new Error('Could not read that image. If it is an iPhone HEIC photo, use the 📷 camera button instead of "Choose photo".'));
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

/* ---------- Claude vision ---------- */
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string', description: 'the date written on the page if any, else an empty string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { time: { type: 'string' }, description: { type: 'string' } },
        required: ['time', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['date', 'rows'],
  additionalProperties: false,
};

const PROMPT =
  'You are transcribing a handwritten daily log / progress report page. Each row has a TIME in the ' +
  'first column and a TASK DESCRIPTION in the second column. Read EVERY row from top to bottom. ' +
  'Transcribe the handwriting exactly as written — do not summarize, correct, rephrase, or invent ' +
  'anything. If a word is illegible, write [?]. If the page shows a date (often in a header), put it ' +
  'in "date" (use ISO YYYY-MM-DD if you can tell, otherwise copy it as written); if there is no date, ' +
  'return an empty string. Return one object per row, in reading order.';

async function transcribe(base64){
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': getKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
    }),
  });

  if (!res.ok){
    let detail = `HTTP ${res.status}`;
    try { const e = await res.json(); detail = e.error?.message || detail; } catch {}
    if (res.status === 401) detail = 'API key was rejected. Check it under "Change API key".';
    throw new Error(detail);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('The model declined to read this image.');
  if (data.stop_reason === 'max_tokens')
    throw new Error('That page had too many rows to read in one pass. Photograph the top half and bottom half as two separate scans.');
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('No transcription came back. Try a clearer photo.');
  try { return { parsed: JSON.parse(textBlock.text) }; }
  catch { throw new Error('Could not read the transcription — try a clearer, straighter photo.'); }
}

async function handleFile(file){
  if (!file) return;
  if (!getKey()){ showSetup(false); return; }
  try {
    setStatus('Preparing image…', 'work');
    const b64 = await fileToDownscaledJpeg(file);
    setStatus('Reading the page with Claude…', 'work');
    const { parsed } = await transcribe(b64);
    const pageDate = (parsed.date || '').trim();
    const newRows = (parsed.rows || []).map(r => ({
      id: uid(), date: pageDate, time: (r.time || '').trim(), description: (r.description || '').trim(),
    }));
    entries.push(...newRows);
    saveEntries();
    renderEntries();
    if (newRows.length === 0) setStatus('No rows found on that page.', 'err');
    else setStatus(`Added ${newRows.length} row${newRows.length===1?'':'s'}. Review & edit below.`, 'ok');
  } catch (err){
    setStatus(err.message || 'Something went wrong.', 'err');
  }
}

/* ---------- entries UI ---------- */
function renderEntries(){
  els.count.textContent = `${entries.length} row${entries.length===1?'':'s'}`;
  if (entries.length === 0){
    els.entries.innerHTML = '<div class="empty">No entries yet. Scan a page to get started.</div>';
    return;
  }
  els.entries.innerHTML = '';
  for (const e of entries){
    const card = document.createElement('div');
    card.className = 'entry';
    card.innerHTML =
      '<div class="top">' +
        `<input class="date" type="text" inputmode="numeric" placeholder="Date" value="${esc(e.date)}" aria-label="Date">` +
        `<input class="time" type="text" placeholder="Time" value="${esc(e.time)}" aria-label="Time">` +
        '<button class="del" aria-label="Delete row">×</button>' +
      '</div>' +
      `<textarea rows="2" placeholder="Task description">${esc(e.description)}</textarea>`;
    const [dateI, timeI] = card.querySelectorAll('input');
    const descT = card.querySelector('textarea');
    dateI.addEventListener('input', () => { e.date = dateI.value; saveEntries(); });
    timeI.addEventListener('input', () => { e.time = timeI.value; saveEntries(); });
    descT.addEventListener('input', () => { e.description = descT.value; autogrow(descT); saveEntries(); });
    card.querySelector('.del').addEventListener('click', () => {
      entries = entries.filter(x => x.id !== e.id); saveEntries(); renderEntries();
    });
    els.entries.appendChild(card);
    autogrow(descT);
  }
}
function autogrow(t){ t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 260) + 'px'; }
function esc(s){ return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- export ---------- */
// --- DOUS-DPR format: one sheet per day, tab named "Weekday.M.D.YYYY" (like the DPR workbook),
//     columns TIME | TASK DESCRIPTION — so a day's scan drops straight into that day's tab. ---
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function parseDate(s){
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);           // ISO YYYY-MM-DD
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);     // M.D.YYYY / M/D/YYYY (US order, like the tabs)
  if (m) return new Date(+m[3], +m[1]-1, +m[2]);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
function dateToSheetName(dateStr){
  const d = parseDate(dateStr);
  const name = d
    ? `${WEEKDAYS[d.getDay()]}.${d.getMonth()+1}.${d.getDate()}.${d.getFullYear()}`
    : ((dateStr || '').trim() || 'Undated');
  return (name.replace(/[:\\/?*\[\]]/g, '-').slice(0, 31)) || 'Sheet';   // Excel sheet-name rules
}

async function exportXlsx(){
  if (entries.length === 0){ setStatus('Nothing to export yet.', 'err'); return; }
  // Group rows by their date, in first-seen order → one worksheet per day.
  const groups = new Map();
  for (const e of entries){
    const k = (e.date || '').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  // DPR styling: TIME (col A) centered; TASK DESCRIPTION merged across B:L, left-anchored.
  const timeCell = { alignment: { horizontal: 'center', vertical: 'center' } };
  const descCell = { alignment: { horizontal: 'left',   vertical: 'center', wrapText: true } };
  const hdrCell  = { alignment: { horizontal: 'center', vertical: 'center' }, font: { bold: true } };
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const [dateKey, rows] of groups){
    let name = dateToSheetName(dateKey), base = name, n = 2;
    while (used.has(name.toLowerCase())){ name = base.slice(0, 27) + ' (' + n + ')'; n++; }   // avoid dup tab names
    used.add(name.toLowerCase());
    const aoa = [['TIME', 'TASK DESCRIPTION'], ...rows.map(e => [e.time, e.description])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges = [];
    for (let r = 0; r < aoa.length; r++){
      merges.push({ s: { r, c: 1 }, e: { r, c: 11 } });               // merge B:L on every row
      const a = ws[XLSX.utils.encode_cell({ r, c: 0 })];              // col A — time
      const b = ws[XLSX.utils.encode_cell({ r, c: 1 })];             // col B — merged description anchor
      if (a) a.s = (r === 0) ? hdrCell : timeCell;
      if (b) b.s = (r === 0) ? hdrCell : descCell;
    }
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 10 }].concat(Array.from({ length: 11 }, () => ({ wch: 9 })));   // A=10, B..L=9
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const fname = `DPR-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const file = new File([blob], fname, { type: blob.type });
  // Phones: hand off to the share sheet (Save to Files / email) — iOS PWAs block
  // programmatic downloads. Desktop: a normal download. Only claim success on the path that ran.
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: fname }); setStatus('Shared — save it to Files, email, etc.', 'ok'); return; }
    catch (e){ if (e && e.name === 'AbortError') return; }   // user cancelled the share sheet
  }
  downloadBlob(blob, fname);
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus('Excel file downloaded.', 'ok');
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
els.scanBtn.addEventListener('click', () => els.fileCam.click());
els.pickBtn.addEventListener('click', () => els.filePick.click());
els.fileCam.addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
els.filePick.addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
els.addRow.addEventListener('click', () => {
  const last = entries[entries.length - 1];
  entries.push({ id: uid(), date: last ? last.date : '', time: '', description: '' });
  saveEntries(); renderEntries();
  els.entries.lastElementChild?.querySelector('.time')?.focus();
});
els.clearAll.addEventListener('click', () => {
  if (entries.length && confirm('Delete all entries? This cannot be undone.')){
    entries = []; saveEntries(); renderEntries(); setStatus('Cleared.', 'ok');
  }
});
els.exportBtn.addEventListener('click', exportXlsx);

/* ---------- boot ---------- */
if (getKey()) showApp(); else showSetup(false);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
