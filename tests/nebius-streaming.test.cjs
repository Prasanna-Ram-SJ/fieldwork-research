const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {completeResearch}=loadTs('src/lib/providers/research-completion.ts');
const chunk=(delta={},finish_reason=null)=>({id:'offline',created:1,model:'offline',choices:[{index:0,delta,finish_reason}]});
function fake(chunks){
 const requests=[],options=[];const controller=new AbortController();
 const client={timeout:1000,chat:{completions:{create:async(body,opts)=>{requests.push(body);options.push(opts);return{controller,async *[Symbol.asyncIterator](){for(const value of chunks){if(value instanceof Error)throw value;yield value;}}};}}}};
 return{client,requests,options,controller};
}
test('provider streaming assembles only visible content and preserves the final usage-only chunk',async()=>{
 const h=fake([chunk({reasoning_content:'PRIVATE THINKING'}),chunk({content:'{"ok":'}),chunk({content:'true}'},'stop'),{choices:[],usage:{prompt_tokens:23,completion_tokens:45,total_tokens:68}}]);
 const result=await completeResearch(h.client,{model:'offline',messages:[],max_tokens:8192,response_format:{type:'json_object'}});
 assert.equal(result.choices[0].message.content,'{"ok":true}');assert.equal(result.usage.total_tokens,68);
 assert.ok(!JSON.stringify(result).includes('PRIVATE THINKING'));
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].stream,true);assert.deepEqual(h.requests[0].stream_options,{include_usage:true});assert.equal(h.options[0].maxRetries,0);
});
test('streaming preserves refusals, content filters and truncation for the existing strict parser',async()=>{
 const {researchJson}=loadTs('src/lib/providers/nebius-research.ts');
 for(const [delta,finish] of [[{refusal:'Cannot comply'},'stop'],[{content:'{}'},'content_filter'],[{content:'{"x":'},'length']]){
  const h=fake([chunk(delta,finish)]);const result=await completeResearch(h.client,{model:'offline',messages:[]});assert.throws(()=>researchJson(result));assert.equal(h.requests.length,1);
 }
});
test('an interrupted stream is not accepted as a complete JSON answer even if a fragment parses',async()=>{
 const h=fake([chunk({content:'{"ok":true}'})]);await assert.rejects(completeResearch(h.client,{model:'offline',messages:[]}),/ended before completion/);assert.equal(h.controller.signal.aborted,true);
});
test('mid-stream errors preserve provider status and do not submit another request',async()=>{
 const denied=Object.assign(new Error('Offline quota denial'),{status:429});const h=fake([chunk({content:'{'}),denied]);
 await assert.rejects(completeResearch(h.client,{model:'offline',messages:[]}),e=>e===denied);assert.equal(h.requests.length,1);assert.equal(h.controller.signal.aborted,true);
});
test('the deadline covers a stalled body after successful headers, cancels it, and never retries',async()=>{
 let calls=0;const controller=new AbortController();
 const client={timeout:20,chat:{completions:{create:async()=>{calls++;return{controller,[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{})})};}}}};
 await assert.rejects(completeResearch(client,{model:'offline',messages:[]}),e=>e.name==='APIConnectionTimeoutError');assert.equal(calls,1);assert.equal(controller.signal.aborted,true);
});
test('caller cancellation also stops a streamed response instead of leaving background inference attached',async()=>{
 const outer=new AbortController(),inner=new AbortController();let calls=0;
 const client={timeout:1000,chat:{completions:{create:async()=>{calls++;return{controller:inner,[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{})})};}}}};
 const result=completeResearch(client,{model:'offline',messages:[]},{signal:outer.signal});outer.abort();await assert.rejects(result,e=>e.name==='AbortError');assert.equal(calls,1);assert.equal(inner.signal.aborted,true);
});
test('a missing usage chunk is left unknown, never invented as zero',async()=>{
 const h=fake([chunk({content:'{}'},'stop')]);const result=await completeResearch(h.client,{model:'offline',messages:[]});assert.equal(result.usage,undefined);
});
test('oversized streamed content is aborted and is not passed to JSON validation',async()=>{
 const h=fake([chunk({content:'x'.repeat(262145)})]);await assert.rejects(completeResearch(h.client,{model:'offline',messages:[]}),/safe size/);assert.equal(h.controller.signal.aborted,true);
});
test('real SDK over native fetch consumes fragmented SSE, retains usage, and keeps the guest reservation before dispatch',async()=>{
 const previous=process.env.PROVIDER_REQUESTS_ENABLED,original=global.fetch;process.env.PROVIDER_REQUESTS_ENABLED='true';let calls=0,reservations=0;
 try{
  const {createNebiusClient}=loadTs('src/lib/providers/nebius.ts');
  // Load via one shared module instance so AsyncLocalStorage is shared with the fetch adapter.
  const budget=loadTs('src/lib/providers/request-budget.ts');
  const {createNebiusClient:budgetClient}=loadTs('src/lib/providers/nebius.ts',{'./request-budget':budget});
  const encode=new TextEncoder();
  const frames=[chunk({reasoning_content:'PRIVATE REASONING'}),chunk({content:'{"result":"café"}'},'stop'),{choices:[],usage:{prompt_tokens:12,completion_tokens:34,total_tokens:46}}];
  const bytes=encode.encode(frames.map(f=>'data: '+JSON.stringify(f)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n');
  global.fetch=async(url,init)=>{calls++;assert.equal(reservations,1);const body=JSON.parse(init.body);assert.equal(body.stream,true);assert.equal(body.stream_options.include_usage,true);assert.equal(body.max_tokens,8192);
   return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
  };
  const client=budgetClient({apiKey:'offline-placeholder',baseURL:'https://offline.invalid/v1',model:'moonshotai/Kimi-K3.1-Pro'});
  const result=await budget.withProviderBudget(async r=>{reservations++;assert.equal(r.outputCap,8192);assert.ok(r.reservedUSD>0)},()=>completeResearch(client,{model:'moonshotai/Kimi-K3.1-Pro',messages:[{role:'user',content:'Offline fixture'}],max_tokens:8192}));
  assert.equal(calls,1);assert.equal(result.choices[0].message.content,'{"result":"café"}');assert.equal(result.usage.total_tokens,46);assert.ok(!JSON.stringify(result).includes('PRIVATE REASONING'));
 }finally{global.fetch=original;previous===undefined?delete process.env.PROVIDER_REQUESTS_ENABLED:process.env.PROVIDER_REQUESTS_ENABLED=previous;}
});
