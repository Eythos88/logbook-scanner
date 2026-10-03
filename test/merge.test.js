// node test/merge.test.js — master-list merge rules
const assert = require('assert');
const { mergeSection, mergeRovs } = require('../kbmerge.js');

const mine = [
  '# KEEP as abbreviations — equipment, systems and documents.',
  'TMS = Tether Management System',
  'IMF = ?',
  'GVI = general visual inspection',
  '',
  '# WRITE OUT in full — operational shorthand.',
  'VM = vessel move',
].join('\n');
const theirs = [
  '# KEEP as abbreviations — equipment, systems and documents.',
  'TMS = tether management system',          // same, different case → nothing
  'IMF = integrated monitoring frame',        // fills my "?"
  'GVI = general visual check',               // conflict → mine kept
  'FLOT = flying lead orientation tool',      // new → into KEEP group
  '',
  '# WRITE OUT in full — operational shorthand.',
  'VM = vessel move',
  'POB = persons on board',                   // new → into WRITE OUT group
  'QD = ?',                                   // new, unknown → still added (I didn't have it)
  '',
  '# Their own group',
  'Always log crane hook height in metres.',  // free line → added at end
].join('\n');

const r = mergeSection(mine, theirs);
const lines = r.text.split('\n');
assert.deepStrictEqual(r.filled, ['IMF = integrated monitoring frame']);
assert.deepStrictEqual(r.conflicts, [{ term: 'GVI', mine: 'general visual inspection', theirs: 'general visual check' }]);
assert.deepStrictEqual(r.added, ['FLOT = flying lead orientation tool', 'POB = persons on board', 'QD = ?', 'Always log crane hook height in metres.']);
assert(lines.indexOf('FLOT = flying lead orientation tool') < lines.indexOf('# WRITE OUT in full — operational shorthand.'), 'FLOT lands in the KEEP group');
assert(lines.indexOf('POB = persons on board') > lines.indexOf('VM = vessel move'), 'POB lands in the WRITE OUT group');
assert.strictEqual(lines[lines.length - 1], 'Always log crane hook height in metres.');
assert(lines.includes('GVI = general visual inspection'), 'my meaning kept on conflict');

// merging the same list twice adds nothing the second time
const again = mergeSection(r.text, theirs);
assert.deepStrictEqual([again.added.length, again.filled.length], [0, 0]);

assert.deepStrictEqual(mergeRovs(['HD39', 'HD55'], ['hd55', 'HD38']), { rovs: ['HD39', 'HD55', 'HD38'], added: ['HD38'] });
// a whole new playbook from a crew-mate arrives with its own header
const ops = mergeSection(
  ['## Mattress installation — asset: mattress ID', '1. Crane off deck with mattress {ID}.'].join('\n'),
  ['## Mattress installation — asset: mattress ID', '1. Crane off deck with mattress {ID}.', '',
   '## Grout bag fill — asset: grout bag ID', '1. Grout hose connected to {ID}.', '2. Grout pumping started on {ID}.'].join('\n'));
const ol = ops.text.split('\n');
assert.deepStrictEqual(ol.slice(-3), ['## Grout bag fill — asset: grout bag ID', '1. Grout hose connected to {ID}.', '2. Grout pumping started on {ID}.']);
assert.strictEqual(ol.filter(l => l.startsWith('## Grout')).length, 1, 'header added once');
console.log('merge rules OK');
