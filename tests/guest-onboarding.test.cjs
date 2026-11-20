const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadTs } = require('./helpers/load-ts.cjs');
const code = 'offline-judge-invite-with-high-entropy';
async function judgeHarness(work) {
  await fs.mkdir(path.resolve('.redesign-backup'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.redesign-backup/judge-test-'));
  const ledgerPath = path.join(dir, 'allowance.json');
  const names = ['JUDGE_ACCESS_CODE_HASH', 'JUDGE_SESSION_SECRET', 'JUDGE_ACCESS_EXPIRES_AT', 'JUDGE_REQUEST_LIMIT', 'JUDGE_LEDGER_PATH'];
  const previous = names.map(n => process.env[n]);
  const hash = createHash('sha256').update(code).digest('hex');
  Object.assign(process.env, { JUDGE_ACCESS_CODE_HASH: hash, JUDGE_SESSION_SECRET: 'offline-test-secret-'.repeat(4), JUDGE_ACCESS_EXPIRES_AT: new Date(Date.now() + 86400000).toISOString(), JUDGE_REQUEST_LIMIT: '3', JUDGE_LEDGER_PATH: ledgerPath });
  await fs.writeFile(ledgerPath, JSON.stringify({ version: 1, codeHash: hash, used: 0, attempts: 0, window: Date.now(), lastAttempt: 0, reservations: [] }));
  const access = loadTs('src/lib/judge/access.ts');
  try { await work({ access, ledgerPath, token: access.issueJudgeSession(code).token }); }
  finally { names.forEach((n, i) => previous[i] === undefined ? delete process.env[n] : process.env[n] = previous[i]); assert.ok(dir.startsWith(path.resolve('.redesign-backup/judge-test-'))); await fs.rm(dir, { recursive: true, force: true }); }
}
test('judge sessions reject wrong, forged, expired and replaced-campaign tokens', async () => {
  await judgeHarness(async ({ access, token }) => {
    assert.throws(() => access.issueJudgeSession('wrong'), /not valid/);
    assert.ok(access.requireJudge(token));
    assert.throws(() => access.requireJudge(token + 'x'), /expired or invalid/);
    assert.throws(() => access.requireJudge(token, Date.now() + 5 * 3600000), /expired or invalid/);
    process.env.JUDGE_ACCESS_CODE_HASH = 'f'.repeat(64);
    assert.throws(() => access.requireJudge(token), /expired or invalid/);
  });
});
test('judge reservations are atomic, shared across sessions, persistent and never refunded', async () => {
  await judgeHarness(async ({ access, token, ledgerPath }) => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => access.reserveJudge(token, 'ask', 'concurrent-' + i)));
    assert.equal(results.filter(r => r.allowed).length, 1);
    assert.equal((await access.judgeStatus(token)).remaining, 2);
    const ledger = JSON.parse(await fs.readFile(ledgerPath)); ledger.lastAttempt = 0; await fs.writeFile(ledgerPath, JSON.stringify(ledger));
    const secondSession = access.issueJudgeSession(code).token;
    assert.equal((await access.reserveJudge(secondSession, 'research', 'second-unique-attempt')).allowed, true);
    const updated = JSON.parse(await fs.readFile(ledgerPath)); updated.lastAttempt = 0; await fs.writeFile(ledgerPath, JSON.stringify(updated));
    const reloaded = loadTs('src/lib/judge/access.ts');
    assert.equal((await reloaded.reserveJudge(token, 'audit', 'third-unique-attempt')).allowed, true);
    assert.equal((await reloaded.reserveJudge(secondSession, 'ask', 'fourth-attempt')).allowed, false);
    assert.equal((await reloaded.judgeStatus(token)).remaining, 0);
    await assert.rejects(fs.access(ledgerPath + '.lock'));
  });
});
test('missing or corrupt judge ledger fails closed and cannot reset spending protection', async () => {
  await judgeHarness(async ({ access, token, ledgerPath }) => {
    await fs.writeFile(ledgerPath, '{}');
    await assert.rejects(access.reserveJudge(token, 'ask', 'request'), /unavailable/);
    await fs.unlink(ledgerPath);
    await assert.rejects(access.judgeStatus(token), /unavailable/);
  });
});
test('code attempts are throttled without consuming live research actions', async () => {
  await judgeHarness(async ({ access, token }) => {
    for(let i = 0; i < 30; i++) await access.checkCodeAttempt();
    await assert.rejects(access.checkCodeAttempt(), /Too many code attempts/);
    assert.equal((await access.judgeStatus(token)).remaining, 3);
  });
});
test('judge API authenticates and validates before reserving and never retries a failed provider', async () => {
  await judgeHarness(async ({ access, token }) => {
    const responses = { studentResponse: (data, status = 200) => ({ data, status }), readStudentBody: async r => r.body };
    let calls = 0;
    const { POST } = loadTs('src/app/api/judge/analyze/route.ts', {
      '@/lib/judge/access': access,
      '@/lib/student/http': responses,
      '@/lib/providers/nebius': { getNebiusConfig: () => ({ model: 'offline' }) },
      '@/lib/student/ai': { prepareStudentAnalysis() {}, async runStudentAnalysis() { calls++; throw Error('private provider details'); } },
      '@/lib/providers/tavily': { searchTavily: () => { throw Error('Unexpected paid search'); } },
      '@/lib/research/synthesizer': { synthesizeResearchAnswer: () => { throw Error('Unexpected synthesis'); } },
    });
    const old = process.env.PROVIDER_REQUESTS_ENABLED; process.env.PROVIDER_REQUESTS_ENABLED = 'true';
    const request = (body, session = token, origin = 'http://localhost:3011') => ({ url: 'http://localhost:3011/api/judge/analyze', headers: new Headers({ origin }), cookies: { get: () => session ? { value: session } : undefined }, body });
    try {
      assert.equal((await POST(request({}, undefined, 'https://attacker.invalid'))).status, 403);
      assert.equal((await POST(request({}, ''))).status, 403);
      assert.equal((await POST(request({ mode: 'student', requestId: 'offline-request-00000001', action: 'plan', project: {} }))).status, 400);
      assert.equal((await access.judgeStatus(token)).remaining, 3);
      const project = { title: 'Offline test', brief: 'Compare two studies', papers: [] };
      const result = await POST(request({ mode: 'student', requestId: 'offline-request-00000002', action: 'plan', project }));
      assert.equal(result.status, 502); assert.equal(calls, 1);
      assert.doesNotMatch(result.data.error, /private provider details/);
      assert.equal((await access.judgeStatus(token)).remaining, 2);
      const replay = await POST(request({ mode: 'student', requestId: 'offline-request-00000002', action: 'plan', project }));
      assert.equal(replay.status, 429); assert.equal(calls, 1);
    } finally { if (old === undefined) delete process.env.PROVIDER_REQUESTS_ENABLED; else process.env.PROVIDER_REQUESTS_ENABLED = old; }
  });
});
test('all prepared paper quotations match real publisher PDF pages and stay current', async () => {
  const papers = JSON.parse(await fs.readFile('public/demo/papers.json', 'utf8'));
  const { buildPreparedProject } = loadTs('src/lib/student/demo.ts');
  const { inputBasis } = loadTs('src/lib/student/types.ts');
  const project = buildPreparedProject(papers);
  assert.equal(papers[0].textPages.length, 7); assert.equal(papers[1].textPages.length, 20);
  for(const analysis of project.analyses) {
    assert.equal(analysis.basis, inputBasis(project, analysis.action, analysis.paperIds, analysis.question));
    const evidence = [ ...(analysis.output.rows || []).flatMap(r => Object.values(r.cells).flatMap(c => c.evidence)), ...(analysis.output.blocks || []).flatMap(b => b.evidence), ...(analysis.output.claims || []).flatMap(c => c.evidence) ];
    for(const quote of evidence) assert.ok(papers.find(p => p.id === quote.paperId).textPages.find(p => p.number === quote.page).text.includes(quote.quote));
  }
});
test('guest projects save, reopen and delete locally without network requests', () => {
  const old = global.localStorage, oldFetch = global.fetch, storage = new Map();
  global.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  global.fetch = () => { throw Error('Guest storage must not access accounts or paid APIs'); };
  try {
    const store = loadTs('src/lib/student/guest-store.ts'), { newProject } = loadTs('src/lib/student/types.ts');
    const first = store.saveGuest({ ...newProject(), title: 'My assignment' });
    assert.equal(store.guestProjects()[0].id, first.id);
    store.saveGuest({ ...first, notes: 'My own thinking' });
    assert.equal(store.guestProjects().length, 1); assert.equal(store.guestProjects()[0].notes, 'My own thinking');
    const prepared = store.saveGuest({ ...newProject(), id: 'prepared-open-access' });
    assert.notEqual(prepared.id, 'prepared-open-access');
    assert.throws(() => store.saveGuest({ ...first, fromYear: '2025', toYear: '2020' }), /start year/);
    store.deleteGuest(prepared.id);
    store.deleteGuest(first.id); assert.equal(store.guestProjects().length, 0);
  } finally { global.localStorage = old; global.fetch = oldFetch; }
});
test('the public demo never passes through Google session middleware', async () => {
  let checks = 0;
  const { middleware } = loadTs('src/middleware.ts', {
    '@supabase/ssr': { createServerClient: () => { checks++; throw Error('Unexpected auth call'); } },
    'next/server': { NextResponse: { next: () => ({ public: true }) } },
  });
  for(const pathname of ['/demo', '/demo/projects', '/demo/research', '/demo/papers.json', '/demo/eysenbach-2006.pdf']) assert.equal((await middleware({ nextUrl: { pathname } })).public, true);
  assert.equal(checks, 0);
});
