const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const text='The laboratory team compared two imaging methods in a small experimental sample. This offline fixture does not establish treatment outcomes.';
const evidence=()=>[{source_ref:'S1',title:'Offline imaging study',original_url:'https://example.invalid/study',reading:{source_ref:'S1',title:'Offline imaging study',url:'https://example.invalid/study',access:'page_text',note:'Offline fixture',read_at:'2026-11-20T00:00:00Z',passages:[{id:'p1',text}]}}];
const support=()=>[{source_ref:'S1',passage_id:'p1',quote:'compared two imaging methods in a small experimental sample'}];
const raw=()=>({scope:'An offline research fixture.',evidence_status:'supported',blocks:[{section:'Short answer',text:'The team compared imaging methods in an experimental sample.',claim_type:'fact',source_refs:['S1'],support:support()}],source_assessments:[{source_ref:'S1',contribution:'An imaging comparison.',method:'Experimental sample.',limitation:'Treatment outcomes were not established.',support:support()}],followups:['What further evidence is needed?'],uncertainty_note:'Offline context only.'});
const completion=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:20}});
function harness(replies){const requests=[];const {synthesizeReport}=loadTs('src/lib/research/report-synthesizer.ts',{'@/lib/providers/research-completion':{completeResearch:(client,body,options)=>client.chat.completions.create(body,options)},'@/lib/providers/nebius':{getNebiusConfig:()=>({model:'offline'}),createNebiusClient:()=>({chat:{completions:{create:async body=>{requests.push(body);const reply=replies.shift();if(reply instanceof Error)throw reply;if(!reply)throw Error('Unexpected extra model request');return reply}}}})}});return{requests,synthesizeReport,run:()=>synthesizeReport('nuclear energy in cancer research',evidence(),{plan:{aspects:[]},coverage:[],queries:['offline'],stopReason:'Offline test'})};}
function assertStrict(result){const {validateReport}=loadTs('src/lib/research/validate-report.ts');validateReport({...result.output,...result.output.report},evidence());}

test('the screenshot failure recovers missing paragraph and comparison support through exact reviewer quotes',async()=>{
 const draft=raw();delete draft.blocks[0].support;delete draft.source_assessments[0].support;
 const h=harness([completion(draft),completion({approved_indices:[0,1],support_updates:[{index:0,support:support()},{index:1,support:support()}]})]);
 const result=await h.run();assert.equal(h.requests.length,2);assert.equal(result.output.blocks[0].text,draft.blocks[0].text);assert.equal(result.output.report.source_assessments.length,1);assertStrict(result);
 const input=JSON.parse(h.requests[1].messages[1].content);assert.deepEqual(input.statements[0].support,[]);assert.equal(input.sources[0].passages[0].text,text);
});
test('one malformed paragraph and one bad comparison do not erase an independently verified paragraph',async()=>{
 const draft=raw();draft.blocks.push({...draft.blocks[0],text:'Unsupported paragraph',source_refs:['S999']});delete draft.source_assessments[0].method;
 const h=harness([completion(draft),completion({approved_indices:[0]})]);const result=await h.run();
 assert.equal(result.output.blocks.length,1);assert.equal(result.output.evidence_status,'limited');assert.equal(result.output.report.source_assessments.length,0);assertStrict(result);
});
test('an approved index alone cannot rescue missing proof; exact excerpts are returned instead',async()=>{
 const draft=raw();draft.blocks[0].support=[];draft.source_assessments=[];
 const h=harness([completion(draft),completion({approved_indices:[0]})]);const result=await h.run();
 assert.equal(result.output.evidence_status,'insufficient');assert.notEqual(result.output.blocks[0].text,draft.blocks[0].text);assert.match(result.output.blocks[0].section,/answer not established/);assertStrict(result);
});
test('a reviewer cannot invent a quote, passage or source to approve a missing-proof statement',async()=>{
 for(const proof of [{source_ref:'S1',passage_id:'p1',quote:'Invented words that never appeared in any source.'},{source_ref:'S1',passage_id:'p99',quote:support()[0].quote},{source_ref:'S999',passage_id:'p1',quote:support()[0].quote}]){
  const draft=raw();delete draft.blocks[0].support;draft.source_assessments=[];
  const h=harness([completion(draft),completion({approved_indices:[0],support_updates:[{index:0,support:[proof]}]})]);const result=await h.run();assert.equal(result.output.evidence_status,'insufficient');assertStrict(result);
 }
});
test('malformed metadata is normalized without discarding a source-grounded paragraph',async()=>{
 const draft=raw();draft.scope=null;draft.followups={bad:true};draft.evidence_status='somewhat supported';draft.source_assessments=[];
 const h=harness([completion(draft),completion({approved_indices:[0]})]);const result=await h.run();assert.equal(result.output.blocks[0].text,draft.blocks[0].text);assert.equal(result.output.report.scope,'nuclear energy in cancer research');assert.deepEqual(result.output.report.followups,[]);assertStrict(result);
});
test('malformed or truncated model JSON exposes evidence only without a repair retry',async()=>{
 for(const reply of [{choices:[{finish_reason:'stop',message:{content:'{"blocks":['}}]},{choices:[{finish_reason:'length',message:{content:'{"blocks":['}}]},completion({blocks:null})]){
  const h=harness([reply]);const result=await h.run();assert.equal(h.requests.length,1);assert.equal(result.output.evidence_status,'insufficient');assertStrict(result);
 }
});
test('verification transport failures and malformed review JSON preserve source excerpts without retrying',async()=>{
 for(const review of [new Error('Offline simulated verifier connection failure'),{choices:[{finish_reason:'stop',message:{content:'not JSON'}}]},completion({approved_indices:'all'})]){
  const h=harness([completion(raw()),review]);const result=await h.run();assert.equal(h.requests.length,2);assert.equal(result.output.evidence_status,'insufficient');assertStrict(result);
 }
});
test('source passages are deduplicated in the verification input and caveats are also reviewed',()=>{
 const {prepareReportDraft,reportReviewInput}=loadTs('src/lib/research/report-draft.ts');const draft=raw();draft.blocks[0].caveat='This is only a limited sample.';delete draft.blocks[0].support;draft.blocks.push({...draft.blocks[0]});
 const input=JSON.parse(reportReviewInput(prepareReportDraft(draft,evidence(),'Offline question').draft,evidence()));assert.equal(input.sources.length,1);assert.equal(input.sources[0].passages.length,1);assert.match(input.statements[0].text,/Caveat: This is only a limited sample/);
});
test('an explicit model refusal is not bypassed by evidence recovery',async()=>{
 const h=harness([{choices:[{finish_reason:'stop',message:{content:null,refusal:'Offline explicit refusal'}}]}]);await assert.rejects(h.run(),/could not provide a research draft/);assert.equal(h.requests.length,1);
});

test('temporary initial generation failures preserve inspectable evidence without another provider call',async()=>{
 for(const failure of [Object.assign(new Error('Offline 524'),{status:524}),Object.assign(new Error('Offline timeout'),{name:'APIConnectionTimeoutError'})]){
  const h=harness([failure]);const result=await h.run();assert.equal(h.requests.length,1);
  assert.equal(result.output.evidence_status,'insufficient');assert.equal(result.usageComplete,false);
  assert.match(result.output.uncertainty_note,/service failure is not a scientific finding/);
  assert.ok(result.output.blocks.some(b=>b.support?.some(s=>text.includes(s.quote))));assertStrict(result);
 }
});

test('generation authorization and quota denials remain errors instead of masquerading as a report',async()=>{
 for(const status of [401,403,429]){
  const h=harness([Object.assign(new Error('Offline denied'),{status})]);await assert.rejects(h.run(),/Offline denied/);assert.equal(h.requests.length,1);
 }
});

test('an evidence-only result preserves six substantial exact excerpts and separate fixed research notes',()=>{
 const {retainVerifiedDraft}=loadTs('src/lib/research/verified-draft.ts');
 const {validateReport}=loadTs('src/lib/research/validate-report.ts');
 const sources=Array.from({length:8},(_,i)=>({...evidence()[0],source_ref:'S'+(i+1),reading:{...evidence()[0].reading,source_ref:'S'+(i+1),passages:[{id:'p1',text:(text+' ').repeat(12)}]}}));
 const result=retainVerifiedDraft({...raw(),blocks:[],source_assessments:[]},sources,{approved_indices:[]});
 assert.equal(result.blocks.filter(b=>b.claim_type==='research_note').length,3);
 const excerpts=result.blocks.filter(b=>b.claim_type==='background');assert.equal(excerpts.length,6);
 assert.ok(excerpts.every(b=>b.support[0].quote.length>280));
 assert.match(result.blocks[0].text,/not proof/);assert.match(result.blocks.at(-1).text,/research steps rather than findings/);
 validateReport(result,sources);
});

test('model claims cannot masquerade as fixed uncited research notes',()=>{
 const {researchNote}=loadTs('src/lib/research/research-notes.ts');
 const {validateReport}=loadTs('src/lib/research/validate-report.ts');
 const note=researchNote('limits',evidence());
 assert.throws(()=>validateReport({...raw(),blocks:[...raw().blocks,{...note,text:'An invented scientific result.'}]},evidence()),/modified/);
 assert.throws(()=>validateReport({...raw(),blocks:[...raw().blocks,{...note,source_refs:['S1']}]},evidence()),/source claim/);
 const {prepareReportDraft}=loadTs('src/lib/research/report-draft.ts');
 assert.equal(prepareReportDraft({...raw(),blocks:[note]},evidence(),'question').draft.blocks.length,0);
});

test('the real guest runner completes the screenshot question when generation omits support',async()=>{
 const draft=raw();delete draft.blocks[0].support;delete draft.source_assessments[0].support;
 const h=harness([completion(draft),completion({approved_indices:[0,1],support_updates:[{index:0,support:support()},{index:1,support:support()}]})]);
 const {runGuestResearch}=loadTs('src/lib/guest/research.ts',{'@/lib/providers/research-completion':{completeResearch:(client,body,options)=>client.chat.completions.create(body,options)},'@/lib/providers/nebius':{getNebiusConfig:()=>({model:'offline'})},'@/lib/research/report-synthesizer':{synthesizeReport:h.synthesizeReport},'@/lib/research/pipeline':{conductResearch:async()=>({plan:{aspects:[]},evidence:evidence(),coverage:[],queries:['offline'],stopReason:'Offline fixture',actualTavilyCredits:0,inputTokens:0,outputTokens:0})}});
 const events=[];await runGuestResearch('nuclear energy in cancer research','',async e=>events.push(e));
 assert.ok(!events.some(e=>e.type==='provider_error'));const done=events.find(e=>e.type==='answer_completed');assert.ok(done);assert.equal(done.payload.answer.blocks[0].text,draft.blocks[0].text);assert.equal(h.requests.length,2);assertStrict({output:done.payload.answer});
});
test('the real guest runner returns evidence instead of a validation error when no proof is recovered',async()=>{
 const draft=raw();delete draft.blocks[0].support;draft.source_assessments=[];
 const h=harness([completion(draft),completion({approved_indices:[0]})]);
 const {runGuestResearch}=loadTs('src/lib/guest/research.ts',{'@/lib/providers/research-completion':{completeResearch:(client,body,options)=>client.chat.completions.create(body,options)},'@/lib/providers/nebius':{getNebiusConfig:()=>({model:'offline'})},'@/lib/research/report-synthesizer':{synthesizeReport:h.synthesizeReport},'@/lib/research/pipeline':{conductResearch:async()=>({plan:{aspects:[]},evidence:evidence(),coverage:[],queries:['offline'],stopReason:'Offline fixture',actualTavilyCredits:0,inputTokens:0,outputTokens:0})}});
 const events=[];await runGuestResearch('nuclear energy in cancer research','',async e=>events.push(e));
 assert.ok(!events.some(e=>e.type==='provider_error'));const done=events.find(e=>e.type==='answer_completed');assert.ok(done);assert.equal(done.payload.answer.evidence_status,'insufficient');assertStrict({output:done.payload.answer});
});
