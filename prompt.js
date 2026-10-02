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
          },
          required: ['time', 'raw', 'clean', 'unclear', 'note', 'unknown_terms'],
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
      '',
      '<master_list>',
      '## Abbreviations', kb.abbrev, '',
      '## Field and structure terms', kb.field, '',
      '## General ROV knowledge', kb.rov, '',
      '## General ROV tooling', kb.tooling,
      '</master_list>',
      '',
      '<house_style_examples>', styleExamples.join('\n'), '</house_style_examples>',
    ].join('\n');
  }

  /** Request body for one page. earlier = [{time, text}] already logged for this ROV + day. */
  function buildRequest({ base64, rov, day, earlier, kb, styleExamples }){
    const ctx = (earlier || []).map(e => `${DPR.fmtTime(e.time)}  ${e.text}`).join('\n');
    const intro = `ROV for this page: ${rov}\nDPR day: ${day}\n\n` +
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
  const HEADERS = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  };

  const api = { MODEL, PAGE_SCHEMA, systemPrompt, buildRequest, HEADERS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PROMPT = api;
})(typeof self !== 'undefined' ? self : this);
