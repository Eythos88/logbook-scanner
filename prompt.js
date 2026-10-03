/* The Claude request for one log page — shared by the app (browser) and test/live.test.js (node). */
(function (root) {
  'use strict';
  const DPR = root.DPR || (typeof require === 'function' ? require('./dpr.js') : null);
  const MODEL = 'claude-opus-5-5';         // vision-capable; best accuracy on real handwriting

  const PAGE_SCHEMA = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: { type: 'string', description: '24-hour HH:MM as written; "24:00" allowed; empty if none' },
            raw: { type: 'string', description: 'the entry exactly as handwritten, [?] for illegible words' },
            clean: { type: 'string', description: 'the cleaned-up DPR task description' },
            unclear: { type: 'boolean', description: 'true if any word, number, ID or time could not be read with confidence' },
            note: { type: 'string', description: 'short reason for the reviewer when unclear, else empty' },
            unknown_terms: { type: 'array', items: { type: 'string' }, description: 'abbreviations not in the master list and not obvious' },
            operation: { type: 'string', description: 'name of the matching operation playbook (text after "## " up to " —"), else empty' },
            step: { type: 'integer', description: 'playbook step number this entry is, else 0' },
            asset: { type: 'string', description: 'ID of the asset this entry is about (e.g. F21), carried from earlier lines when not written; else empty' },
            fix_text: { type: 'string', description: 'when unclear: your best context-based reading of the whole line, for the reviewer to accept or reject; else empty' },
            fix_time: { type: 'string', description: 'when the time is unreadable or out of sequence: your best HH:MM from the handwriting and neighbouring times; else empty' },
            term_suggestions: {
              type: 'array',
              description: 'one per unknown_terms entry',
              items: {
                type: 'object',
                properties: {
                  term: { type: 'string' },
                  meaning: { type: 'string', description: 'the standard offshore/ROV meaning if you are confident, else "?"' },
                  group: { type: 'string', enum: ['keep', 'write_out'], description: 'keep = equipment/system/document name; write_out = operational shorthand' },
                },
                required: ['term', 'meaning', 'group'],
                additionalProperties: false,
              },
            },
          },
          required: ['time', 'raw', 'clean', 'unclear', 'note', 'unknown_terms', 'operation', 'step', 'asset', 'fix_text', 'fix_time', 'term_suggestions'],
          additionalProperties: false,
        },
      },
    },
    required: ['rows'],
    additionalProperties: false,
  };
  
  function systemPrompt(kb, styleExamples){
    return [
      'You turn photos of handwritten ROV shift logs into Daily Progress Report (DPR) task-log lines for an offshore ROV crew.',
      '',
      'For each entry on the page, top to bottom, return:',
      '- time: the entry time as 24-hour HH:MM. If a line has no time of its own and is clearly the continuation of the entry above, join it to that entry instead of making a new row.',
      '- raw: exactly what is written, uncorrected. Use [?] for any word you cannot read.',
      '- clean: the same entry rewritten as a clear, professional DPR line.',
      '',
      'How to write "clean":',
      '- Before rewriting, read the whole page and the earlier entries supplied for this day, so you understand what operation is underway. Use that context to make the point of each entry clear: what the ROV, crew, crane or vessel did, to what, and the result.',
      '- Write in full formal DPR language, like the house style examples: complete sentences, clear subject and verb, past or present-continuous tense ("HD39 exited the TMS", "Vessel move complete"). Join related events with ";" instead of "/". Write "at" instead of "@", put a space between number and unit ("10 m", "40 psi"), and write counts under ten as words ("Two leaks").',
      '- Name things fully the first time it helps the reader: "lift bag LBW-03", "the carousel", "the crane". Refer to the ROV by its name.',
      '- Fix spelling and grammar. Correct misspelt ROV names to the ROV given for this page.',
      '- Follow the master list: terms under "KEEP as abbreviations" stay abbreviated; terms under "WRITE OUT" are written in words. Copy IDs (bags, mattresses, structures) in the exact form the master list gives.',
      '- Keep the bare single-word marker lines "Dive" and "Location" exactly as one word.',
      `- Keep each line at or under ${DPR.LINE_MAX} characters. Only go longer if the entry genuinely cannot be said in fewer; it will wrap onto a continuation row.`,
      '- NEVER add facts that are not in the handwriting: no new numbers, depths, IDs, names, causes, results or reasons. Context may clarify wording; it may not invent content. If the meaning is uncertain, stay close to the original wording and set unclear=true with a short note.',
      '- In the master list, "?" means the meaning is unknown: keep that term as written, do not guess its meaning.',
      '- A legible term that is simply not in the master list goes in unknown_terms only. Do not also set unclear=true for it — unclear is for handwriting you could not read.',
      '',
      'Operations and assets (see <operation_playbooks>):',
      '- Work out which operation is underway and which asset (mattress, bag, structure…) each entry is about. Shift logs often leave the ID off later steps ("released", "in SOZ") — carry the asset from earlier lines of the same cycle, including the earlier entries supplied.',
      '- When an entry is a step of a playbook, set operation, step and asset, and write "clean" in that step\'s wording with {ID} and {ROV} filled in. Add any extra detail that is written on the line (a reason, a depth, a problem) after the step wording.',
      '- If you cannot tell which asset an entry is about, leave asset empty, set unclear=true and say so in the note. Never invent an asset ID.',
      '- Entries that are not a playbook step: operation empty, step 0; asset still set if the line is about an asset.',
      '',
      'Suggested fixes (the reviewer accepts or rejects these — they never go in "clean" on their own):',
      '- fix_text: only when unclear=true. Your most likely reading of the whole line in the same formal style, using the rest of the page to resolve the hard-to-read part. Still no invented facts. Empty when there is nothing better to offer.',
      '- fix_time: only when the time is unreadable, or plainly out of sequence with its neighbours (a likely misread digit). Your best HH:MM. Empty otherwise.',
      '- term_suggestions: one per unknown term. Give the standard offshore/ROV meaning only if you are confident; otherwise "?".',
      '',
      '<master_list>',
      '## Abbreviations', kb.abbrev, '',
      '## Field and structure terms', kb.field, '',
      '## General ROV knowledge', kb.rov, '',
      '## General ROV tooling', kb.tooling,
      '</master_list>',
      '',
      '<operation_playbooks>', kb.ops || '(none)', '</operation_playbooks>',
      '',
      '<house_style_examples>', styleExamples.join('\n'), '</house_style_examples>',
    ].join('\n');
  }

  /** Request body for one page. earlier = [{time, text}] already logged for this ROV + day. */
  function buildRequest({ base64, rov, day, earlier, previousDay, kb, styleExamples }){
    const ctx = (earlier || []).map(e => `${DPR.fmtTime(e.time)}  ${e.text}`).join('\n');
    const prev = (previousDay || []).map(e => `${DPR.fmtTime(e.time)}  ${e.text}`).join('\n');
    const intro = `ROV for this page: ${rov}\nDPR day: ${day}\n\n` +
      (prev ? `Last entries of the previous day (context: an operation may carry over midnight):\n${prev}\n\n` : '') +
      (ctx ? `Entries already logged earlier this day (context only — do not repeat them):\n${ctx}\n\n` : '') +
      'Transcribe and clean every entry on this page.';
    return {
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(kb, styleExamples),
      fallbacks: 'default',                    // server-side refusal fallback (beta header below)
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: intro },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        ],
      }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema: PAGE_SCHEMA } },
    };
  }
  const SHORTEN_SCHEMA = {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  };
  /** Request to shorten one DPR line to fit, keeping every fact. Text only (no image). */
  function buildShortenRequest({ line, before, after, kb, styleExamples }){
    return {
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt(kb, styleExamples),
      fallbacks: 'default',
      messages: [{
        role: 'user',
        content: `Shorten this DPR line to at most ${DPR.LINE_MAX} characters, in the same formal style. ` +
          'Keep every fact: every number, ID, name, action and result. Remove only filler words, and use master-list abbreviations under KEEP if that helps. ' +
          'Return just the new line.\n\n' +
          (before ? `Line before (context): ${before}\n` : '') +
          `LINE: ${line}\n` +
          (after ? `Line after (context): ${after}\n` : ''),
      }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SHORTEN_SCHEMA } },
    };
  }

  const HEADERS = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  };

  const api = { MODEL, PAGE_SCHEMA, systemPrompt, buildRequest, buildShortenRequest, HEADERS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PROMPT = api;
})(typeof self !== 'undefined' ? self : this);
