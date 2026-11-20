const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { loadTs } = require('./helpers/load-ts.cjs');
function bundled(file, mocks = {}) {
  const source = require('esbuild').buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', target: 'node24', packages: 'external', write: false }).outputFiles[0].text;
  const m = new Module(path.resolve(file), module), normal = m.require.bind(m); m.filename = path.resolve(file); m.paths = module.paths; m.require = name => Object.hasOwn(mocks,name) ? mocks[name] : normal(name); m._compile(source, m.filename); return m.exports;
}
const reading = (ref, text = 'The study compared two groups and reported a limited association in the selected sample.') => ({ source_ref: ref, title: 'Study '+ref, url: 'https://research.org/'+ref, domain: 'research.org', published_at: null, access: 'page_text', note: 'Selected passages only', read_at: new Date().toISOString(), content_hash: 'hash-'+ref, truncated: false, passages: [{ id: 'p1', text }] });
const evidence = () => ['S1','S2','S3','S4'].map(source_ref => ({ source_ref, title: 'Study '+source_ref, original_url: 'https://research.org/'+source_ref, canonical_url: 'https://research.org/'+source_ref, domain:'research.org', published_at:null, snippet:'Search snippet for study', score:.9, query_text:'q', selected:true, reading:reading(source_ref) }));
const rawReport = () => ({ scope:'A bounded comparison of the selected studies.', evidence_status:'limited', blocks:[{section:'Short answer', text:'The selected study reports a limited association.',claim_type:'fact',source_refs:['S1'],support:[{source_ref:'S1',passage_id:'p1',quote:'reported a limited association'}]}], source_assessments:[{source_ref:'S1', contribution:'Reports an association.', method:'Compares two groups.', limitation:'Limited to the selected sample.', support:[{source_ref:'S1',passage_id:'p1',quote:'The study compared two groups'}]}],followups:['What would a longer follow-up establish?'],uncertainty_note:'No causal guarantee established.' });
test('public reader blocks private, mapped, link-local, metadata and credential URLs', () => {
  const r = bundled('src/lib/research/source-reader.ts');
  for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.3','169.254.169.254','100.64.1.2','::1','fd00::1','fe80::1','::ffff:127.0.0.1']) assert.equal(r.publicAddress(ip),false,ip);
  assert.equal(r.publicAddress('8.8.8.8'),true);
  for(const url of ['http://example.org','https://localhost','https://127.0.0.1','https://[::1]','https://u:p@example.org','https://example.org:8443']) assert.throws(()=>r.safeSourceUrl(url));
});
test('public reader rejects rebinding/private DNS answers before any HTTP request', async () => {
  let fetched = 0;
  const r = bundled('src/lib/research/source-reader.ts', { 'node:dns/promises': { lookup: async () => [{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}] }, 'node:https': { get(){fetched++;throw Error('Unexpected HTTP');} } });
  await assert.rejects(r.publicSourceBytes('https://research.org',AbortSignal.timeout(1000)),/private network/); assert.equal(fetched,0);
});
test('readability extracts text without executing scripts and ranks useful passages', () => {
  const r = bundled('src/lib/research/source-reader.ts');
  const text = 'Methods: students compared practice tests and rereading. Results: the sample had limited follow-up. '.repeat(25);
  const parsed = r.parseSourceHtml('<html><head><title>Study</title></head><body><nav>Navigation junk</nav><article><h1>Study</h1><p>'+text+'</p></article><script>throw Error("script executed")</script></body></html>');
  assert.match(parsed.text,/Methods/); assert.doesNotMatch(parsed.text,/script executed|Navigation junk/);
  const passages = r.readingPassages([{page:3,text:parsed.text}],'practice tests methods limitations');
  assert.ok(passages.length<=4); assert.equal(passages[0].page,3); assert.ok(passages.every(p=>p.text.length<=1300));
});
test('original text returned by search remains bounded and abstract records are labeled honestly', async () => {
  const oldFetch=global.fetch;
  global.fetch=async(_url,options)=>{const request=JSON.parse(options.body);assert.equal(request.include_raw_content,'text');assert.equal(request.search_depth,'basic');return{ok:true,json:async()=>({query:'q',results:[{title:'Study',url:'https://research.org/paper',content:'excerpt',raw_content:'Full original article. '.repeat(10000)}],usage:{credits:1}})}};
  try {
    const {searchTavily}=loadTs('src/lib/providers/tavily.ts',{'./access':{assertProviderRequestsEnabled(){}}});
    const result=await searchTavily({query:'q',search_depth:'basic',include_raw_content:true},'offline-placeholder');
    assert.equal(result.results[0].raw_content.length,100000);assert.equal(result.creditsUsed,1);
    const r=bundled('src/lib/research/source-reader.ts');
    const source={...evidence()[0],domain:'pubmed.ncbi.nlm.nih.gov',original_text:'Abstract. Methods and findings in the sample. '.repeat(30)};
    assert.equal(r.serviceReading(source,'methods').access,'abstract_only');
  } finally {global.fetch=oldFetch;}
});
test('server PDF reader parses actual publisher pages using the pinned HTTP path', async () => {
  const bytes = fs.readFileSync('public/demo/eysenbach-2006.pdf'); let requests = 0;
  const { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
  const r = bundled('src/lib/research/source-reader.ts', {
    'node:dns/promises': { lookup: async () => [{address:'8.8.8.8',family:4}] },
    'node:https': { get(url, options, callback) { requests++; options.lookup('research.org', {all:true}, (error, addresses) => { assert.equal(addresses[0].address,'8.8.8.8'); }); const req = new EventEmitter(); req.setTimeout=()=>{}; req.destroy=()=>{}; queueMicrotask(()=>{const response = new PassThrough(); response.statusCode=200;response.headers={'content-type':'application/pdf'};callback(response);response.end(bytes);}); return req; } },
  });
  const source = {...evidence()[0], reading:undefined};
  const result = await r.readSource(source,'open access citations');
  assert.equal(requests,1); assert.equal(result.access,'pdf_text'); assert.equal(result.page_count,7); assert.ok(result.passages.some(p=>p.page));
});
test('report validation rejects invented quotations, wrong passages and citation/proof mismatch', () => {
  const { validateReport } = loadTs('src/lib/research/validate-report.ts');
  assert.equal(validateReport(rawReport(),evidence()).blocks[0].section,'Short answer');
  const invented=rawReport();invented.blocks[0].support[0].quote='A result which is absent from this study';assert.throws(()=>validateReport(invented,evidence()),/did not match/);
  const wrong=rawReport();wrong.blocks[0].support[0].passage_id='p9';assert.throws(()=>validateReport(wrong,evidence()),/did not match/);
  const mismatch=rawReport();mismatch.blocks[0].support[0].source_ref='S2';assert.throws(()=>validateReport(mismatch,evidence()),/citation did not match/);
});
test('coverage depends on every planned aspect and rejects invented source IDs', () => {
  const {validateCoverage} = loadTs('src/lib/research/coverage.ts', {'@/lib/providers/nebius':{}});
  const plan={queries:['q'],aspects:[{id:'a1',question:'Methods?'},{id:'a2',question:'Long-term outcomes?'}]};
  const result=validateCoverage({coverage:[{aspect_id:'a1',status:'addressed',source_refs:['S1'],reason:'Methods available'},{aspect_id:'a2',status:'missing',source_refs:[],reason:'No follow-up'}],refinement_query:'long term outcomes'},plan,evidence());
  assert.equal(result.query,'long term outcomes');assert.equal(result.coverage[1].status,'missing');
  assert.throws(()=>validateCoverage({coverage:[{aspect_id:'a1',status:'addressed',source_refs:['S99']}]},plan,evidence()));
});
test('pipeline searches for a missing aspect even with four sources, and stops at three calls', async () => {
  let searches=0, checks=0;const reads=[],events=[];
  const {conductResearch}=loadTs('src/lib/research/pipeline.ts',{
    './planner':{planResearchQueries:async()=>({queries:['first','second'],aspects:[{id:'a1',question:'Long-term outcomes?'}],focus:'study outcomes',format:'report'})},
    '@/lib/providers/tavily':{searchTavily:async({query})=>{searches++;return{query,creditsUsed:1,results:[]}}},
    './dedup':{normalizeUrl:()=>null,deduplicateAndRankEvidence:()=>evidence().map(e=>({...e,reading:undefined}))},
    './source-reader':{readEvidence:async(sources,focus,max,onRead)=>{reads.push(max);for(const e of sources){e.reading=reading(e.source_ref);await onRead(e);}return sources;}},
    './coverage':{assessCoverage:async()=>{checks++;return{coverage:[{aspect_id:'a1',status:checks===1?'missing':'partial',source_refs:['S1'],reason:'Follow-up limited'}],query:'third targeted query',available:true}}},
  });
  const result=await conductResearch('Question','',[],async(type,payload)=>events.push({type,payload}));
  assert.equal(searches,3);assert.deepEqual(reads,[3,1]);assert.equal(checks,2);assert.match(result.stopReason,/three-search limit/);assert.equal(result.actualTavilyCredits,3);
});
test('follow-up reuse is relevant, recent and disabled for time-sensitive questions; copied evidence collapses', () => {
  const { reusableSources, uniqueReadings }=loadTs('src/lib/research/pipeline.ts',{'./planner':{},'@/lib/providers/tavily':{},'./source-reader':{},'./coverage':{}});
  const source=reading('S1','Students learning with practice tests showed limited follow-up.');
  assert.equal(reusableSources('students learning practice tests',[{sources:[source]}],false).length,1);
  assert.equal(reusableSources('ocean temperatures',[{sources:[source]}],false).length,0);
  assert.equal(reusableSources('students learning',[{sources:[source]}],true).length,0);
  assert.equal(reusableSources('students learning',[{sources:[{...source,read_at:'2000-01-01'}]}],false).length,0);
  const copied=evidence();copied[1].reading.content_hash=copied[0].reading.content_hash;assert.equal(uniqueReadings(copied).length,3);
});
test('report verification covers source-comparison claims as well as answer paragraphs', async () => {
  let calls=0;
  const completion = content=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:5,completion_tokens:10}});
  const reports=[completion(rawReport()),completion({approved_indices:[0]})];
  const { synthesizeReport }=loadTs('src/lib/research/report-synthesizer.ts',{
    '@/lib/providers/nebius':{getNebiusConfig:()=>({model:'offline'}),createNebiusClient:()=>({chat:{completions:{create:async()=>{calls++;return reports.shift();}}}})},
  });
  const result=await synthesizeReport('Question',evidence(),{plan:{aspects:[]},coverage:[],queries:['q'],stopReason:'bounded'});
  assert.equal(result.output.blocks.length,1);assert.equal(result.output.report.source_assessments.length,0);assert.equal(result.output.evidence_status,'limited');assert.match(result.output.uncertainty_note,/omitted/);assert.equal(calls,2);
});
test('very broad questions receive a useful clarification while narrow factual questions proceed', () => {
  const {clarificationFor}=loadTs('src/lib/research/clarify.ts');
  assert.ok(clarificationFor('AI'));assert.ok(clarificationFor('Tell me about technology'));assert.ok(clarificationFor('Compare'));
  assert.equal(clarificationFor('What is photosynthesis?'),null);assert.equal(clarificationFor('Does practice testing improve delayed retention for university students?'),null);
  assert.equal(clarificationFor('Explain photosynthesis'),null);
});
test('the research API requests clarification before any conversation lookup or provider work', async () => {
  let queried=0; const old=process.env.PROVIDER_REQUESTS_ENABLED;process.env.PROVIDER_REQUESTS_ENABLED='true';
  try {
    const {POST}=loadTs('src/app/api/research/route.ts',{
      'next/server':{NextResponse:{json:(body,{status})=>({body,status})}},
      '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'offline'}}})},from(){queried++;throw Error('Unexpected DB lookup');}})},
      '@/lib/research/orchestrator':{runResearchOrchestration(){throw Error('Unexpected provider work');}},
    });
    const result=await POST({json:async()=>({question:'AI',conversation_id:'offline'})});
    assert.equal(result.status,422);assert.equal(result.body.needs_clarification,true);assert.equal(queried,0);
  } finally {if(old===undefined)delete process.env.PROVIDER_REQUESTS_ENABLED;else process.env.PROVIDER_REQUESTS_ENABLED=old;}
});
test('the Workspace prepared report quotations match their real publisher PDF text', () => {
  const {exampleAnswer}=loadTs('src/lib/example.ts');
  const papers=JSON.parse(fs.readFileSync('public/demo/papers.json','utf8'));
  for(const source of exampleAnswer.report.sources) {
    const paper=papers.find(p=>source.title===p.title);
    assert.ok(paper);
    for(const passage of source.passages) assert.ok(paper.textPages.find(p=>p.number===passage.page).text.includes(passage.text));
  }
  const all=[...exampleAnswer.blocks.flatMap(b=>b.support),...exampleAnswer.report.source_assessments.flatMap(r=>r.support)];
  for(const proof of all) assert.ok(exampleAnswer.report.sources.find(s=>s.source_ref===proof.source_ref).passages.find(p=>p.id===proof.passage_id).text.includes(proof.quote));
});
