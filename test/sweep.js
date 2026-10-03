// node test/sweep.js <keyfile> [model:effort ...]  — real Claude calls (costs money, ~$1 for the full sweep).
// Reads the three synthetic pages with each model + effort and grades every line against what the page
// actually says, to find the cheapest setting that still gets everything right.
const fs = require('fs'), path = require('path'), vm = require('vm');
const DPR = require('../dpr.js');
const PROMPT = require('../prompt.js');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../knowledge.js'), 'utf8'), ctx);
const KB = ctx.KB;

const PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10] };   // $ per million tokens in / out
const key = fs.readFileSync(process.argv[2], 'utf8').trim();
const configs = process.argv.length > 3 ? process.argv.slice(3) :
  ['claude-sonnet-5-5:low', 'claude-sonnet-5-5:medium', 'claude-sonnet-5-5:high', 'claude-opus-5-5:low', 'claude-opus-5-5:medium', 'claude-opus-5-5:high'];

const has = (s, re) => re.test(s || '');
const LBW = n => new RegExp(`LBW-?${n}`);
/* Each check: [label, rows => true when right]. Rows are the model's output in page order. */
const PAGES = {
  page1: { times: ['12:10','12:18','12:20','12:22','12:29','12:40','12:47','12:50','12:56','13:07','13:19','13:23','13:28','15:44','15:49'], checks: [
    ['Dive kept as one word', r => r[1].clean.trim() === 'Dive'],
    ['HD309 corrected to HD39, 10 m', r => has(r[2].clean, /HD39/) && !has(r[2].clean, /HD309/) && has(r[2].clean, /10 m/)],
    ['Seabird kept (meaning unknown)', r => has(r[3].clean, /seabird/i)],
    ['15 m', r => has(r[4].clean, /15 m/)],
    ['crane / carousel line', r => has(r[5].clean, /HD39/) && has(r[5].clean, /carousel/i) && has(r[5].clean, /deck/i)],
    ['VM written out', r => has(r[6].clean, /vessel move/i) && has(r[7].clean, /vessel move/i)],
    ['LBW-03 air on', r => has(r[8].clean, LBW('03'))],
    ['leak LBW-03', r => has(r[9].clean, LBW('03')) && has(r[9].clean, /leak/i)],
    ['40 psi', r => has(r[10].clean, /40 psi/)],
    ['LBW-03 full, to LBW-04', r => has(r[11].clean, LBW('03')) && has(r[11].clean, LBW('04'))],
    ['two leaks LBW-04, LBW-03 leaking', r => has(r[12].clean, /two leaks|2 leaks/i) && has(r[12].clean, LBW('04')) && has(r[12].clean, LBW('03'))],
    ['AFI written out', r => has(r[13].clean, /awaiting further instructions/i)],
    ['Location kept as one word', r => r[14].clean.trim() === 'Location'],
  ]},
  page2: { times: ['13:00','13:07','13:12', null,'13:25','13:40'], checks: [
    ['LBW-05 heading', r => has(r[0].clean, /HD39/) && has(r[0].clean, LBW('05'))],
    ['FLOT kept, not guessed', r => has(r[1].clean, /FLOT/) && !has(r[1].clean, /float/i) && (r[1].unknown_terms || []).includes('FLOT')],
    ['smudged word not guessed', r => !has(r[2].clean, /carousel/i) && r[2].unclear],
    ['smudged hour flagged', r => r[3].unclear || !r[3].time],
    ['GVI: all seven bags', r => ['01','02','03','04','05','06','07'].every(n => has(r[4].clean, LBW(n)))],
    ['in TMS, to deck', r => has(r[5].clean, /TMS/) && has(r[5].clean, /deck/i)],
  ]},
  page3: { times: ['00:07','00:24','00:27','00:37','01:00','01:05','01:15','01:30','01:53','02:30','02:33','02:50','03:00','03:07','03:15'], checks: [
    ['asset IDs on the right lines', r => r.every((x, i) => (x.asset || '').toUpperCase() === (i < 4 ? 'F21' : i < 9 ? 'F22' : 'B4'))],
    ['F21 released', r => has(r[2].clean, /F21/) && has(r[2].clean, /releas/i)],
    ['no invented F22 release', r => !r.some(x => has(x.clean, /F22/) && has(x.clean, /\breleased\b/i) && !has(x.clean, /green light/i))],
    ['B4 released', r => has(r[13].clean, /B4/) && has(r[13].clean, /releas/i)],
  ]},
};
const PREV3 = [{ time: '23:20', text: 'Crane off deck with mattress F21.' }, { time: '23:25', text: 'Visual inspection of mattress F21 complete; rigging inspection complete.' }];

async function run(model, effort, page){
  const base64 = fs.readFileSync(path.join(__dirname, `fixtures/${page}.jpg`)).toString('base64');
  const body = PROMPT.buildRequest({ base64, rov: 'HD39', day: '2026-10-02', earlier: [], previousDay: page === 'page3' ? PREV3 : [],
    kb: KB.KNOWLEDGE, styleExamples: KB.STYLE_EXAMPLES, model });
  body.output_config.effort = effort;
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: Object.assign({ 'x-api-key': key }, PROMPT.HEADERS), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(data.error)}`);
  const secs = (Date.now() - t0) / 1000;
  const [pin, pout] = PRICE[model];
  const cost = (data.usage.input_tokens * pin + data.usage.output_tokens * pout) / 1e6;
  const rows = JSON.parse(data.content.find(b => b.type === 'text').text).rows;
  const spec = PAGES[page], fails = [];
  if (rows.length !== spec.times.length) fails.push(`${rows.length} rows, expected ${spec.times.length}`);
  else {
    spec.times.forEach((t, i) => { if (t && DPR.fmtTime(rows[i].time) !== t) fails.push(`time ${i + 1}: ${rows[i].time} != ${t}`); });
    for (const [label, ok] of spec.checks) { let pass = false; try { pass = ok(rows); } catch {} if (!pass) fails.push(label); }
  }
  const over = rows.filter(r => r.clean.length > DPR.LINE_MAX).length;
  return { secs, cost, fails, over, rows };
}

(async () => {
  const out = [];
  for (const c of configs){
    const [model, effort] = c.split(':');
    const res = await Promise.all(Object.keys(PAGES).map(p => run(model, effort, p).then(r => [p, r]).catch(e => [p, { error: e.message }])));
    const line = { config: c, pages: {} };
    for (const [p, r] of res){
      line.pages[p] = r;
      console.log(`${c.padEnd(26)} ${p}  ` + (r.error ? 'ERROR ' + r.error :
        `${r.secs.toFixed(1).padStart(5)} s  ${(r.cost * 100).toFixed(2).padStart(5)}¢  over127=${r.over}  ${r.fails.length ? 'FAIL: ' + r.fails.join(' | ') : 'all correct'}`));
    }
    out.push(line);
  }
  fs.writeFileSync(path.join(__dirname, 'sweep-out.json'), JSON.stringify(out, null, 1));
})();
