// node test/live.test.js <keyfile> [image]  — ONE real Claude call with the app's exact request.
// Costs a few cents. Prints the transcribed + cleaned rows and checks the hard rules.
const fs = require('fs'), path = require('path'), vm = require('vm');
const DPR = require('../dpr.js');
const PROMPT = require('../prompt.js');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../knowledge.js'), 'utf8'), ctx);
const KB = ctx.KB;

const key = fs.readFileSync(process.argv[2], 'utf8').trim();
const img = process.argv[3] || path.join(__dirname, 'fixtures/page1.jpg');
const base64 = fs.readFileSync(img).toString('base64');

(async () => {
  const body = PROMPT.buildRequest({ base64, rov: 'HD39', day: '2026-09-16', earlier: [], kb: KB.KNOWLEDGE, styleExamples: KB.STYLE_EXAMPLES });
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: Object.assign({ 'x-api-key': key }, PROMPT.HEADERS), body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.log('HTTP', res.status, JSON.stringify(data.error)); process.exit(1); }
  console.log('stop_reason', data.stop_reason, '| model', data.model, '| secs', ((Date.now() - t0) / 1000).toFixed(1), '| usage', JSON.stringify(data.usage));
  const rows = JSON.parse(data.content.find(b => b.type === 'text').text).rows;
  let bad = 0;
  for (const r of rows) {
    const over = r.clean.length > DPR.LINE_MAX;
    if (over) bad++;
    console.log(`${DPR.fmtTime(r.time).padEnd(6)} RAW  ${r.raw}\n       DPR  ${r.clean}${over ? '   <-- OVER ' + DPR.LINE_MAX : ''}${r.unclear ? '   [unclear: ' + r.note + ']' : ''}${r.unknown_terms.length ? '   [unknown: ' + r.unknown_terms.join(', ') + ']' : ''}`);
  }
  console.log(rows.length, 'rows;', bad ? bad + ' over the line limit' : 'all within line limit');
})();
