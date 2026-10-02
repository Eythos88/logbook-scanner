// node test/export.test.js  → writes test/out.xlsx and checks the pure rules
const assert = require('assert');
const path = require('path');
const fs = require('fs'), vm = require('vm');
// load the browser bundle exactly as the page does (global XLSX), not via node's require
const ctx = { console, Uint8Array, ArrayBuffer, Buffer };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../vendor/xlsx.bundle.js'), 'utf8'), ctx);
const XLSX = ctx.XLSX;
const DPR = require('../dpr.js');

assert.strictEqual(DPR.parseTime('00:15'), 15 / 1440);
assert.strictEqual(DPR.parseTime('0015'), 15 / 1440);
assert.strictEqual(DPR.parseTime('7:05'), 425 / 1440);
assert.strictEqual(DPR.parseTime('24:00'), 1);
assert.strictEqual(DPR.parseTime('25:00'), null);
assert.strictEqual(DPR.parseTime('XXXX'), null);
assert.strictEqual(DPR.fmtTime('7:5'), '7:5');          // unreadable stays as written
assert.strictEqual(DPR.fmtTime('705'), '07:05');

const long = 'Begin Inspections on Lift Bags / LBW01-good / LBW02-good / LBW03-leak / LBW04-multiple leaks / LBW05-good / LBW06-leak on black plate / LBW07-leak on black plate / LBW08-visible bubbles.';
const parts = DPR.splitLine(long);
assert(parts.length === 2 && parts.every(p => p.length <= DPR.LINE_MAX), 'long line splits under cap');
assert.strictEqual(parts.join(' '), long, 'split loses no text');

const entries = [
  { time: '00:00', text: 'Begin this day, HD39 on deck. Vessel on location.' },
  { time: '00:15', text: "Crew review HSE paperwork for today's planned tasks." },
  { time: '14:08', text: long },
  { time: '24:00', text: 'End this day, ROV on deck, vessel at anchorage.' },
];
const rows = DPR.toRows(entries);
assert.deepStrictEqual(rows.map(r => typeof r.time === 'number' ? 'n' : r.time), ['n', 'n', 'n', 'XXXX', 'n']);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, DPR.buildSheet(XLSX, entries), 'HD39');
const out = path.join(__dirname, 'out.xlsx');
fs.writeFileSync(out, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
console.log('pure rules OK; wrote', out);
