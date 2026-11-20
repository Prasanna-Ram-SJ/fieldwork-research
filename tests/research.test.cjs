const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
function load(file,mocks={}){const filename=path.resolve(file),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;const normal=m.require.bind(m);m.require=name=>Object.hasOwn(mocks,name)?mocks[name]:normal(name);const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;m._compile(source,filename);return m.exports}
const {validateAnswer}=load('src/lib/research/validate-answer.ts');
const {normalizeUrl,deduplicateAndRankEvidence}=load('src/lib/research/dedup.ts');
const {reserveBudget}=load('src/lib/budget/limits.ts');
const modelSettings=load('src/lib/providers/nebius-research.ts');
const valid={evidence_status:'supported',blocks:[{text:'A supported claim.',claim_type:'fact',source_refs:['S1']}]};
test('accepts a well-formed cited answer',()=>assert.equal(validateAnswer(valid,new Set(['S1'])).blocks.length,1));
test('rejects invented citations',()=>assert.throws(()=>validateAnswer(valid,new Set(['S2'])),/not retrieved/));
test('rejects unsourced facts instead of disguising them as inference',()=>assert.throws(()=>validateAnswer({...valid,blocks:[{...valid.blocks[0],source_refs:[]}]},new Set(['S1'])),/no supporting citation/));
test('rejects empty or malformed model output',()=>{for(const raw of [null,{}, {blocks:[]}, {...valid,evidence_status:'certain'}])assert.throws(()=>validateAnswer(raw,new Set(['S1'])))});
test('rejects executable URL schemes',()=>{assert.equal(normalizeUrl('javascript:alert(1)'),null);assert.equal(normalizeUrl('file:///etc/passwd'),null)});
test('deduplicates tracking variants and bounds snippets',()=>{const s=deduplicateAndRankEvidence([{query:'q',results:[{title:'One',url:'https://example.com/a?utm_source=x',content:'a'.repeat(1200)},{title:'Again',url:'https://example.com/a',content:'Second excerpt'}]}]);assert.equal(s.length,1);assert.equal(s[0].source_ref,'S1');assert.ok(s[0].snippet.length<=800)});
test('fails closed when quota RPC is missing',async()=>{let calls=0;const r=await reserveBudget({rpc:async()=>{calls++;return {error:{message:'missing function'}}}},'user','run');assert.equal(r.allowed,false);assert.equal(calls,1)});
test('reserves a fixed maximum search budget',async()=>{let params;const r=await reserveBudget({rpc:async(_,p)=>{params=p;return {data:{allowed:true}}}},'u','r',1);assert.equal(params.p_estimated_tavily_credits,3);assert.equal(r.allowed,true)});

const completion = (content,finish_reason='stop') => ({choices:[{finish_reason,message:{role:'assistant',content,refusal:null,reasoning_content:'private reasoning must not be returned'}}]});
function mockResearch(file, responses) {
  const calls=[];
  const client={chat:{completions:{async create(request){calls.push(request);if(!responses.length)throw new Error('Unexpected extra model request');return responses.shift()}}}};
  return {calls,...load(file,{
    '@/lib/providers/nebius':{getNebiusConfig:()=>({model:modelSettings.KIMI_RESEARCH_MODEL}),createNebiusClient:()=>client},
    '@/lib/providers/nebius-research':modelSettings,
    './validate-answer':{validateAnswer},
  })};
}

test('Kimi JSON parser rejects truncated, empty, refused and malformed replies without exposing reasoning',()=>{
  const {researchJson}=modelSettings;
  assert.deepEqual(researchJson(completion('```json\n{"ok":true}\n```')),{ok:true});
  assert.throws(()=>researchJson(completion('{"ok":true}','length')),/output limit/);
  assert.throws(()=>researchJson(completion(null)),/no answer/);
  assert.throws(()=>researchJson(completion('not JSON')),/invalid structured answer/);
  assert.throws(()=>researchJson(completion('{}','content_filter')),/could not complete/);
  const refused=completion('{}');refused.choices[0].message.refusal='Cannot answer';
  assert.throws(()=>researchJson(refused),/could not complete/);
});

test('Kimi planning and refinement preserve bounded search queries with reasoning headroom',async()=>{
  const planner=mockResearch('src/lib/research/planner.ts',[completion(JSON.stringify({queries:['first query','second query','extra query'],strategy_reason:'Two angles.'}))]);
  const plan=await planner.planResearchQueries('Question?');
  assert.deepEqual(plan.queries,['first query','second query']);
  assert.equal(planner.calls.length,1);
  assert.equal(planner.calls[0].model,'moonshotai/Kimi-K3.1-Pro');
  assert.equal(planner.calls[0].max_tokens,4096);
  assert.equal(planner.calls[0].reasoning_effort,'low');
  assert.equal(planner.calls[0].response_format.type,'json_object');
  const refinement=mockResearch('src/lib/research/refinement.ts',[completion(JSON.stringify({needs_refinement:true,refinement_query:'alternative angle',reason:'Missing evidence.'}))]);
  assert.equal((await refinement.planRefinementQuery('Question?',['first'],[])).query,'alternative angle');
  assert.equal(refinement.calls[0].max_tokens,4096);
  assert.equal(refinement.calls[0].reasoning_effort,'low');
});

test('Kimi synthesis and verification use the new model and still reject unsupported paragraphs',async()=>{
  const evidence=[{source_ref:'S1',title:'Source',domain:'example.invalid',snippet:'A supported claim.',published_at:null}];
  const answer=()=>({...completion(JSON.stringify(valid)),usage:{prompt_tokens:10,completion_tokens:20}});
  const review=()=>({...completion('{"approved_indices":[0]}'),usage:{prompt_tokens:5,completion_tokens:8}});
  const h=mockResearch('src/lib/research/synthesizer.ts',[answer(),review()]);
  let verified=0;
  const result=await h.synthesizeResearchAnswer('Question?',evidence,undefined,async()=>{verified++});
  assert.equal(verified,1);
  assert.equal(h.calls.length,2);
  for(const request of h.calls){assert.equal(request.model,'moonshotai/Kimi-K3.1-Pro');assert.equal(request.max_tokens,8192);assert.equal(request.reasoning_effort,'high');assert.equal(request.response_format.type,'json_object')}
  assert.equal(result.output.blocks[0].text,'A supported claim.');
  assert.equal(result.inputTokens,15);assert.equal(result.outputTokens,28);
  assert.ok(!JSON.stringify(result).includes('private reasoning'));
  const rejected=mockResearch('src/lib/research/synthesizer.ts',[answer(),completion('{"approved_indices":[]}')]);
  await assert.rejects(()=>rejected.synthesizeResearchAnswer('Question?',evidence),/could not support/);
  const truncated=mockResearch('src/lib/research/synthesizer.ts',[completion(JSON.stringify(valid),'length')]);
  await assert.rejects(()=>truncated.synthesizeResearchAnswer('Question?',evidence),/output limit/);
  assert.equal(truncated.calls.length,1);
});

test('a future non-Kimi model retains its existing caps without unsupported reasoning options',()=>{
  for(const [stage,limit]of Object.entries({planning:300,refinement:250,synthesis:1500,verification:500}))assert.deepEqual(modelSettings.researchCompletionSettings('other/model',stage),{max_tokens:limit});
});

test('Kimi client keeps the provider guard, a bounded longer timeout and no automatic retries',()=>{
  let guarded=0,options;
  class FakeClient{constructor(value){options=value}}
  const mock={openai:{default:FakeClient},'./access':{assertProviderRequestsEnabled(){guarded++}},'./nebius-research':modelSettings,'./request-budget':{providerFetch(){throw Error('No network in constructor check')}}};
  const {createNebiusClient}=load('src/lib/providers/nebius.ts',mock);
  createNebiusClient({model:modelSettings.KIMI_RESEARCH_MODEL,apiKey:'offline-placeholder',baseURL:'https://example.invalid/v1'});
  assert.equal(guarded,1);assert.equal(options.timeout,180000);assert.equal(options.maxRetries,0);assert.equal(typeof options.fetch,'function');
  const blocked=load('src/lib/providers/nebius.ts',{...mock,'./access':{assertProviderRequestsEnabled(){throw new Error('Provider requests disabled')}}});
  assert.throws(()=>blocked.createNebiusClient({model:modelSettings.KIMI_RESEARCH_MODEL}),/disabled/);
});
