const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const {loadTs}=require('./helpers/load-ts.cjs');
function environment(){const names=['GUEST_RESEARCH_ENABLED','MAX_GUEST_REQUESTS_TOTAL','JUDGE_SESSION_SECRET','PROVIDER_REQUESTS_ENABLED','TAVILY_API_KEY'];const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));Object.assign(process.env,{GUEST_RESEARCH_ENABLED:'true',MAX_GUEST_REQUESTS_TOTAL:'20',JUDGE_SESSION_SECRET:'offline-test-secret-'.repeat(3),PROVIDER_REQUESTS_ENABLED:'true',TAVILY_API_KEY:'offline-unused'});return()=>{for(const k of names)old[k]===undefined?delete process.env[k]:process.env[k]=old[k]};}
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('cloudflare/guest-schema.sql','utf8'));const db={withSession:()=>db,prepare(sql){return{bind(...v){return{async first(){return sqlite.prepare(sql).get(...v)||null},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...v).changes)}}}}}}}};return{db,sqlite};}

test('Nebius SDK uses native fetch and never retries a connection failure',async()=>{
 const restore=environment(),original=global.fetch;let calls=0;
 try {const {createNebiusClient}=loadTs('src/lib/providers/nebius.ts');
 global.fetch=async(url,init)=>{calls++;assert.equal(url,'https://offline.invalid/v1/chat/completions');assert.equal(init.method,'POST');return new Response(JSON.stringify({id:'offline',choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}'}}]}),{headers:{'Content-Type':'application/json'}})};
 const client=createNebiusClient({apiKey:'offline-unused',baseURL:'https://offline.invalid/v1',model:'offline'});
 assert.equal((await client.chat.completions.create({model:'offline',messages:[]})).id,'offline');assert.equal(calls,1);
 global.fetch=async()=>{calls++;throw new Error('offline simulated transport failure')};
 await assert.rejects(client.chat.completions.create({model:'offline',messages:[]}),/Connection error/);assert.equal(calls,2);
 }finally{global.fetch=original;restore();}
});
test('guest cookies are signed, expire, and cannot be used as judge sessions',()=>{
 const restore=environment();try{const access=loadTs('src/lib/guest/access.ts');const now=Date.now();const session=access.guestSession(undefined,now,true);
 assert.equal(access.guestSession(session.token,now).id,session.id);
 assert.throws(()=>access.guestSession(session.token+'x',now),/guest session/);
 assert.throws(()=>access.guestSession(session.token,session.expiry),/guest session/);
 const judge=loadTs('src/lib/judge/access.ts');assert.throws(()=>judge.requireJudge(session.token),/judge code|session/i);
 assert.ok(!JSON.stringify(access.guestIdentity(session.id,'192.0.2.1',now)).includes('192.0.2.1'));
 }finally{restore();}
});
test('guest reservations enforce daily visitor and network caps, including cleared cookies and duplicate requests',async()=>{
 const restore=environment(),{db,sqlite}=database();try{const a=loadTs('src/lib/guest/access.ts'),now=Date.now(),day=Date.parse(new Date(now).toISOString().slice(0,10)+'T01:00:00Z'),identity=a.guestIdentity(randomUUID(),'192.0.2.1',day),id=randomUUID();
 await a.reserveGuest(db,identity,id,day);await assert.rejects(a.reserveGuest(db,identity,id,day+21000),/only once/);
 await a.reserveGuest(db,identity,randomUUID(),day+21000);await a.reserveGuest(db,identity,randomUUID(),day+42000);
 await assert.rejects(a.reserveGuest(db,identity,randomUUID(),day+63000),/allowance reached/);
 for(let i=0;i<2;i++)await a.reserveGuest(db,a.guestIdentity(randomUUID(),'192.0.2.1',day),randomUUID(),day);
 await assert.rejects(a.reserveGuest(db,a.guestIdentity(randomUUID(),'192.0.2.1',day),randomUUID(),day),/allowance reached/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM guest_research_reservations').get().n,5);
 }finally{sqlite.close();restore();}
});
test('atomic guest reservations cap concurrent callers and never reset shared capacity',async()=>{
 const restore=environment(),{db,sqlite}=database();try{process.env.MAX_GUEST_REQUESTS_TOTAL='3';const a=loadTs('src/lib/guest/access.ts'),now=Date.now();
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>a.reserveGuest(db,a.guestIdentity(randomUUID(),'192.0.2.'+i,now),randomUUID(),now)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 await assert.rejects(a.reserveGuest(db,a.guestIdentity(randomUUID(),'192.0.2.99',now+86400000),randomUUID(),now+86400000),/allowance reached/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM guest_research_reservations').get().n,3);
 }finally{sqlite.close();restore();}
});
test('guest provider costs are reserved atomically before dispatch and never exceed one dollar',async()=>{
 const restore=environment(),{db,sqlite}=database();try{const a=loadTs('src/lib/guest/access.ts'),now=Date.now(),id=randomUUID();
 await a.reserveGuest(db,a.guestIdentity(randomUUID(),'192.0.2.1',now),id,now);
 const cost={provider:'nebius',reservedUSD:0.4,inputUpper:100,outputCap:100,at:new Date(now).toISOString()};
 const results=await Promise.allSettled(Array.from({length:4},()=>a.reserveGuestProvider(db,id,cost)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
 const row=sqlite.prepare('SELECT reserved_usd,cost_events FROM guest_research_reservations WHERE request_id=?').get(id);
 assert.equal(row.reserved_usd,0.8);assert.equal(JSON.parse(row.cost_events).length,2);
 await assert.rejects(a.reserveGuestProvider(db,id,{...cost,reservedUSD:-1}),/budget/);
 }finally{sqlite.close();restore();}
});
test('an active provider budget denies traffic before native fetch and keeps no automatic retries',async()=>{
 const restore=environment(),original=global.fetch;let calls=0;try{const {providerFetch,withProviderBudget}=loadTs('src/lib/providers/request-budget.ts');global.fetch=async()=>{calls++;return new Response('{}')};
 await assert.rejects(withProviderBudget(async()=>{throw Error('offline cap')},()=>providerFetch('tavily','https://offline.invalid',{body:JSON.stringify({search_depth:'basic'})})),/offline cap/);assert.equal(calls,0);
 let reservation;await withProviderBudget(async r=>{reservation=r},()=>providerFetch('nebius','https://offline.invalid',{body:JSON.stringify({model:'moonshotai/Kimi-K3.1-Pro',max_tokens:200,messages:[{role:'user',content:'offline'}]})}));assert.equal(calls,1);assert.ok(reservation.reservedUSD>0);assert.equal(reservation.outputCap,200);
 }finally{global.fetch=original;restore();}
});
test('guest route rejects cross-origin and malformed requests before reserving or running providers',async()=>{
 const restore=environment();let reservations=0,runs=0;try{const {NextRequest}=require('next/server'),a=loadTs('src/lib/guest/access.ts'),session=a.guestSession(undefined,Date.now(),true);
 const {POST}=loadTs('src/app/api/guest/research/route.ts',{'@/lib/providers/nebius':{getNebiusConfig:()=>({model:'offline'})},'@/lib/guest/access':{...a,guestDatabase:async()=>({}),reserveGuest:async()=>{reservations++;return{remaining:2}}},'@/lib/guest/research':{runGuestResearch:async(q,c,emit)=>{runs++;await emit({research_run_id:'offline',sequence:1,timestamp:new Date().toISOString(),type:'answer_completed',payload:{answer:{blocks:[]}}})}}});
 function request(body,origin='https://fieldwork.invalid'){return new NextRequest('https://fieldwork.invalid/api/guest/research',{method:'POST',headers:{origin,'cf-connecting-ip':'192.0.2.1',cookie:a.GUEST_COOKIE+'='+session.token,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)})}
 assert.equal((await POST(request({question:'What did NASA DART demonstrate?',request_id:randomUUID()},'https://other.invalid'))).status,403);
 assert.equal((await POST(request('{'))).status,400);
 assert.equal((await POST(request({question:'a'.repeat(1001),request_id:randomUUID()}))).status,400);
 assert.equal(reservations,0);assert.equal(runs,0);
 const response=await POST(request({question:'What did NASA DART demonstrate?',request_id:randomUUID()}));assert.equal(response.status,200);assert.match(await response.text(),/event: answer_completed/);assert.equal(reservations,1);assert.equal(runs,1);
 }finally{restore();}
});
test('rejected research returns only exact excerpts when no model paragraphs pass verification',()=>{
 const {retainVerifiedDraft}=loadTs('src/lib/research/verified-draft.ts'),{validateSupports}=loadTs('src/lib/research/validate-report.ts');
 const evidence=[{source_ref:'S1',reading:{passages:[{id:'p1',text:'This is an offline source passage, included to verify exact quotations rather than model assertions.'}]}}];
 const draft={blocks:[{text:'An unsupported invented conclusion.',claim_type:'fact',source_refs:['S1']}],source_assessments:[],scope:'An unsupported scope',followups:['An unsupported premise?'],evidence_status:'supported',uncertainty_note:'An unsupported additional model assertion.'};
 const result=retainVerifiedDraft(draft,evidence,{approved_indices:[]});
 assert.equal(result.evidence_status,'insufficient');assert.equal(result.blocks.length,1);assert.ok(!JSON.stringify(result).includes('unsupported'));assert.deepEqual(result.followups,[]);
 assert.match(result.uncertainty_note,/could not establish a complete answer/);assert.match(result.blocks[0].section,/answer not established/);
 assert.equal(validateSupports(result.blocks[0].support,evidence).length,1);
});
test('invalid verification decisions never expose unchecked draft paragraphs',()=>{
 const {retainVerifiedDraft}=loadTs('src/lib/research/verified-draft.ts');const draft={blocks:[{text:'unchecked'}],source_assessments:[]};
 const evidence=[{source_ref:'S1',reading:{passages:[{id:'p1',text:'An exact offline source passage for a safe evidence-only result.'}]}}];
 for(const review of [{},{approved_indices:[7]},{approved_indices:[-1]},{approved_indices:['0']}]){const result=retainVerifiedDraft(draft,evidence,review);assert.equal(result.evidence_status,'insufficient');assert.ok(!result.blocks.some(b=>b.text==='unchecked'));}
});
