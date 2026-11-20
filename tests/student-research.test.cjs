const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { loadTs } = require('./helpers/load-ts.cjs');
const model = loadTs('src/lib/student/types.ts');
const validation = loadTs('src/lib/student/validation.ts');
const evidence = loadTs('src/lib/student/evidence.ts');
const exportsModule = loadTs('src/lib/student/exports.ts');
const quote = 'Forty students completed a synthetic test of retrieval practice.';
function paper(id = 'paper-one') {
  return validation.validatePaper({ id, title: 'Synthetic methods fixture', authors: [{ given: 'Jane', family: 'Example' }], year: 2024,
    doi: '10.1234/fixture', journal: 'Fixture Journal', textScope: 'full_text', textPages: [{ number: 2, text: 'Synthetic test document, not an actual published study. ' + quote + ' This was a correlational design. The finding does not establish causation.' }], notes: '', tags: [] });
}
function project() { return { ...model.newProject(), id: 'project-id', revision: 1, brief: 'Compare study methods. Use five papers and APA references.', question: 'What do the selected studies establish?', papers: [paper()], draft: 'Retrieval practice causes better learning.' }; }

test('paper and project validation cap text, mark truncation, normalize DOIs and keep source hashes honest', () => {
  const p = validation.validatePaper({ ...paper(), contentHash: 'forged', textPages: [{ number: 9, text: 'a'.repeat(20000) }] });
  assert.equal(p.textScope, 'partial_text');
  assert.equal(p.textPages[0].text.length, 15000);
  assert.notEqual(p.contentHash, 'forged');
  assert.equal(validation.normalizeDoi('https://doi.org/10.1234/hello'), '10.1234/hello');
  assert.equal(validation.normalizeDoi('javascript:alert(1)'), '');
  assert.equal(validation.safeLink('https://name:secret@host.invalid'), '');
  assert.equal(validation.safeLink('javascript:alert(1)'), '');
  const old = project(); old.analyses = [{ key: 'server-analysis' }];
  const validated = validation.validateProject({ ...old, analyses: [{ key: 'forged-analysis' }] }, old);
  assert.deepEqual(validated.analyses, old.analyses);
  assert.throws(() => validation.validatePaper({ ...paper(), textPages: [{ number: 0, text: quote }] }), /page number/);
  assert.throws(() => validation.validateProject({ ...project(), fromYear: '2026', toYear: '2020' }), /start year/);
});
test('reading selection gives each paper actual page references and bounded context', () => {
  const sources = Array.from({ length: 12 }, (_, i) => ({ ...paper('p' + i), textPages: [{ number: i + 1, text: (quote + ' Methods participants results. ').repeat(100) }] }));
  const passages = evidence.readingPassages(sources, 'retrieval practice');
  assert.equal(new Set(passages.map(p => p.paperId)).size, 12);
  assert.ok(passages.reduce((n, p) => n + p.text.length, 0) <= 26000);
  assert.equal(passages.find(p => p.paperId === 'p9').page, 10);
});
test('quotation matching preserves scientific superscripts instead of silently changing their meaning', () => {
  assert.equal(evidence.normalizeQuote('A dose of 10² units.'), 'A dose of 10² units.');
  const p = { ...paper(), textPages: [{ number: 1, text: 'The synthetic concentration was 10² units per sample.' }] };
  const passages = evidence.readingPassages([p], 'concentration');
  assert.throws(() => evidence.validateStudentOutput('ask', { blocks: [{ text: 'A result.', evidence: [{ paperId: p.id, page: 1, quote: 'The synthetic concentration was 102 units per sample.' }] }] }, passages, [p]), /could not be located/);
});
test('evidence cells reject invented quotation text, page numbers and paper identifiers', () => {
  const source = paper(), passages = evidence.readingPassages([source], 'methods');
  const cell = { text: 'Forty participants.', evidence: [{ paperId: source.id, page: 2, quote }] };
  const row = { paperId: source.id, cells: Object.fromEntries(model.FIELDS.map(field => [field, cell])) };
  const valid = evidence.validateStudentOutput('extract', { rows: [row] }, passages, [source]);
  assert.equal(valid.rows[0].cells.methods.evidence[0].page, 2);
  for (const bad of [{ paperId: source.id, page: 3, quote }, { paperId: 'invented', page: 2, quote }, { paperId: source.id, page: 2, quote: 'A fabricated finding about a thousand students.' }]) {
    assert.throws(() => evidence.validateStudentOutput('extract', { rows: [{ ...row, cells: { objective: { text: 'Claim', evidence: [bad] } } }] }, passages, [source]), /could not be located/);
  }
  const missing = evidence.validateStudentOutput('extract', { rows: [{ paperId: source.id, cells: {} }] }, passages, [source]);
  assert.equal(missing.rows[0].cells.methods.text, 'Not established in the available passages.');
});
test('draft judgments must quote the real draft and attach located evidence to supported claims', () => {
  const p = project(), passages = evidence.readingPassages(p.papers, 'methods');
  assert.throws(() => evidence.validateStudentOutput('audit', { claims: [{ claim: 'Not in this draft', status: 'not_found' }] }, passages, p.papers, p.draft), /not in your draft/);
  assert.throws(() => evidence.validateStudentOutput('audit', { claims: [{ claim: p.draft, status: 'supported', evidence: [] }] }, passages, p.papers, p.draft), /missing its source/);
  const result = evidence.validateStudentOutput('audit', { claims: [{ claim: p.draft, status: 'partial', explanation: 'Association does not establish causation.', evidence: [{ paperId: p.papers[0].id, page: 2, quote }] }] }, passages, p.papers, p.draft);
  assert.equal(result.claims[0].status, 'partial');
  assert.deepEqual(evidence.validateStudentOutput('ask', { blocks: [], gaps: ['The available text does not report this.'] }, passages, p.papers), { blocks: [], gaps: ['The available text does not report this.'] });
});
test('analysis cache changes for relevant inputs but paper extraction survives edits to unrelated notes and drafts', () => {
  const p = project(), ids = p.papers.map(p => p.id), before = model.inputBasis(p, 'extract', ids);
  assert.equal(model.inputBasis({ ...p, notes: 'My own notes', draft: 'Changed draft' }, 'extract', ids), before);
  assert.notEqual(model.inputBasis({ ...p, question: 'A new question' }, 'extract', ids), before);
  assert.notEqual(model.inputBasis({ ...p, papers: [{ ...p.papers[0], contentHash: 'different-text' }] }, 'extract', ids), before);
  const planning = model.inputBasis(p, 'plan', []);
  assert.equal(model.inputBasis({ ...p, question: 'Approved proposed question' }, 'plan', []), planning);
});
test('exports use real CSL APA/MLA formatting, omit unknown years and neutralize CSV formulas', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => ({ ok: true, text: async () => fs.readFileSync('public' + url, 'utf8') });
  try {
    const apa = await exportsModule.formattedBibliography([paper()], 'apa');
    const mla = await exportsModule.formattedBibliography([paper()], 'mla');
    assert.match(apa.join(''), /Example, J\./);
    assert.match(apa.join(''), /2024/);
    assert.match(mla.join(''), /Example, Jane/);
    assert.notDeepEqual(apa, mla);
    assert.doesNotMatch(exportsModule.bibtex([{ ...paper(), year: null }]), /year\s*=/);
    assert.match(exportsModule.ris([paper()]), /TY  - JOUR/);
    assert.match(exportsModule.evidenceCsv({ ...project(), papers: [{ ...paper(), title: '=WEBSERVICE("unsafe")' }] }), /"'=WEBSERVICE/);
  } finally { global.fetch = originalFetch; }
});
test('project store scopes every lookup and revision update to the authenticated owner', async () => {
  const calls = [];
  const p = project();
  const db = { from(table) {
    const builder = { select(value) { calls.push(['select', table, value]); return this; }, eq(...args) { calls.push(['eq', table, ...args]); return this; }, is() { return this; }, update(value) { calls.push(['update', table, value]); return this; },
      async single() { return { data: table === 'conversations' ? { id: p.id, title: model.PROJECT_PREFIX + p.id } : { id: 'snapshot', content: { project: p } }, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: [{ id: 'snapshot' }], error: null }).then(resolve, reject); } };
    return builder;
  } };
  const store = loadTs('src/lib/student/store.ts');
  const loaded = await store.loadProject(db, 'owner-id', p.id);
  assert.equal(loaded.messageId, 'snapshot');
  const saved = await store.saveProject(db, 'owner-id', 'snapshot', p, 1);
  assert.equal(saved.revision, 2);
  assert.ok(calls.filter(c => c[0] === 'eq' && c[2] === 'user_id' && c[3] === 'owner-id').length >= 4);
  assert.ok(calls.some(c => c[0] === 'eq' && c[2] === 'content->>revision' && c[3] === '1'));
  const update = calls.find(c => c[0] === 'update' && c[1] === 'messages');
  assert.equal(update[2].content.summary.papers, 1);
});
test('student AI endpoint reuses a server cache and fails closed on quota denial before provider access', async () => {
  const p = project(), basis = model.inputBasis(p, 'plan', [], ''), key = createHash('sha256').update(basis).digest('hex');
  let providerCalls = 0, reservations = 0, saved = 0;
  const database = { from() { return { insert() { return this; }, select() { return this; }, async single() { return { data: { id: 'run-id' } }; }, update() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } }; } };
  let cached = true;
  const route = loadTs('src/app/api/student/ai/route.ts', {
    '@/lib/student/http': { studentSession: async () => ({ db: database, user: { id: 'owner' } }), readStudentBody: async () => ({ projectId: p.id, action: 'plan', paperIds: [] }), studentResponse: (data, status = 200) => ({ data, status }), studentFailure: e => ({ status: e.status || 500, error: e.message }) },
    '@/lib/student/store': { ...loadTs('src/lib/student/store.ts'), loadProject: async () => ({ messageId: 'snapshot', project: { ...p, analyses: cached ? [{ key, basis, action: 'plan', output: { plan: { question: 'Cached question' } } }] : [] } }), saveProject: async (_db, _user, _id, value) => { saved++; return value; } },
    '@/lib/student/ai': { prepareStudentAnalysis() {}, runStudentAnalysis: async () => { providerCalls++; throw Error('A live request is forbidden in this offline test'); } },
    '@/lib/providers/nebius': { getNebiusConfig: () => ({ model: 'offline-model' }) },
    '@/lib/budget/limits': { reserveBudget: async () => { reservations++; return { allowed: false, message: 'Allowance reached.' }; } },
  });
  const old = process.env.PROVIDER_REQUESTS_ENABLED; process.env.PROVIDER_REQUESTS_ENABLED = 'true';
  try {
    const hit = await route.POST({});
    assert.equal(hit.data.cached, true); assert.equal(providerCalls, 0); assert.equal(reservations, 0); assert.equal(saved, 0);
    cached = false;
    const denied = await route.POST({});
    assert.equal(denied.status, 429); assert.equal(providerCalls, 0); assert.equal(reservations, 1);
  } finally { if (old === undefined) delete process.env.PROVIDER_REQUESTS_ENABLED; else process.env.PROVIDER_REQUESTS_ENABLED = old; }
});

test('switching accounts immediately hides and clears another account’s browser recovery project', async () => {
  const React = require('react');
  const old = { storage: global.localStorage, fetch: global.fetch };
  const slots = [], effects = [];
  let cursor = 0, account = { user: { id: 'account-a' }, authReady: true };
  const privateProject = { ...project(), title: 'Private account A assignment' };
  global.localStorage = { getItem: key => key.endsWith('account-a') ? JSON.stringify(privateProject) : null, removeItem() {}, setItem() {} };
  global.fetch = async () => ({ ok: true, json: async () => ({ projects: [], more: false }) });
  try {
    const hooks = { ...React,
      useCallback: fn => fn,
      useEffect: fn => effects.push(fn),
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    };
    const { StudentDesk } = loadTs('src/components/StudentDesk.tsx', {
      react: hooks,
      './ResearchProvider': { useResearch: () => account },
      './StudentSource': { StudentSource: () => null, SourceButtons: () => null, paperLink: () => '' },
      'next/link': { default: 'a' },
      'lucide-react': Object.fromEntries(['Plus','Search','Upload','ArrowRight','Trash2','Download','Check','Loader2','FileText'].map(name => [name, 'svg'])),
    });
    const render = () => { cursor = 0; effects.length = 0; return StudentDesk(); };
    render(); const cleanupA = effects[0]();
    assert.match(JSON.stringify(render()), /Private account A assignment/);
    account = { user: { id: 'account-b' }, authReady: true };
    assert.doesNotMatch(JSON.stringify(render()), /Private account A assignment/);
    const mountB = effects[0]; cleanupA(); const cleanupB = mountB();
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(JSON.stringify(render()), /Private account A assignment/);
    cleanupB();
  } finally { global.localStorage = old.storage; global.fetch = old.fetch; }
});
