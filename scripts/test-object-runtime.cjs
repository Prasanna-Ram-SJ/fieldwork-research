// Real workerd Durable Object boundary; every provider is mocked and external I/O blocked.
const fs=require('node:fs'),assert=require('node:assert/strict'),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
(async()=>{
 const defaults={GUEST_SESSION_SECRET:'offline-object-secret-'.repeat(3),GUEST_RESEARCH_ENABLED:'true',MAX_GUEST_REQUESTS_TOTAL:'100',PROVIDER_REQUESTS_ENABLED:'true',NEBIUS_API_KEY:'offline-unused',NEBIUS_MODEL:'moonshotai/Kimi-K3.1-Pro',TAVILY_API_KEY:'offline-unused'};
 const entry=`import worker,{ResearchRunner} from './cloudflare/worker';import {researchJobHttp} from './src/lib/hosting/job-http';export {ResearchRunner};let pending=[];
 export default {async fetch(request,env,ctx){Object.assign(process.env,${JSON.stringify(defaults)});env.RESEARCH_JOBS={send:async body=>pending.push(body)};if(new URL(request.url).pathname==='/process'){const batch=pending.splice(0);await worker.queue({messages:batch.map(body=>({body,ack(){}}))},env,ctx);return new Response(null,{status:204});}return researchJobHttp(request,env);}}`;
 const files={
  'init':`export function runWithCloudflareRequestContext(r,e,c,work){Object.assign(process.env,${JSON.stringify(defaults)});return work();}`,
  'server':`import {consumeResearchJobs} from './src/lib/hosting/job-consumer';import {getJob,openInput,claimJob} from './src/lib/hosting/job-store';export class DOQueueHandler{};export class DOShardedTagCache{};export class BucketCachePurge{};export default {async fetch(request,env){const id=request.headers.get('X-Research-Job'),job=await getJob(env.JUDGE_QUOTA,id);if(job&&job.sealed_input&&openInput(job.sealed_input).question.includes('simulate interruption')){await claimJob(env.JUDGE_QUOTA,id);throw Error('offline runtime eviction');}await consumeResearchJobs({messages:[{body:{id},ack(){}}]},env);return new Response(null,{status:204});}};`,
  'research':`export async function runGuestResearch(q,c,emit){await emit({research_run_id:'offline',sequence:1,type:'answer_completed',payload:{answer:{blocks:[{text:'Offline response'}]}}});}`,
  'orchestrator':`export async function runResearchOrchestration(){throw Error('Account is outside this offline fixture');}`
 };
 const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['node:*'],write:false,plugins:[{name:'offline-object',setup(b){b.onResolve({filter:/\.open-next\/worker\.js$/},()=>({path:'server',namespace:'fixture'}));b.onResolve({filter:/\.open-next\/cloudflare\/init\.js$/},()=>({path:'init',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/(guest\/research|research\/orchestrator)$/},a=>({path:a.path.includes('/guest/')?'research':'orchestrator',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:files[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
 let outbound=0;const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'worker.mjs',contents:bundle.outputFiles[0].text}],compatibilityDate:'2026-11-01',compatibilityFlags:['nodejs_compat'],d1Databases:{JUDGE_QUOTA:'offline-object-db'},durableObjects:{RESEARCH_RUNNER:{className:'ResearchRunner',useSQLite:true}},outboundService:async()=>{outbound++;throw Error('External requests forbidden');}}));
 try{
  const db=await mf.getD1Database('JUDGE_QUOTA');for(const f of ['cloudflare/guest-schema.sql','cloudflare/research-jobs.sql'])await db.exec(fs.readFileSync(f,'utf8').replace(/--[^\n]*/g,'').replace(/\s+/g,' '));
  let visitor=0;
  for(const [question,expected]of [['What did NASA DART demonstrate?','completed'],['Please simulate interruption for this offline fixture','failed']]){
   const ip='192.0.2.'+(++visitor),session=await mf.dispatchFetch('https://offline.invalid/api/guest/session',{headers:{'cf-connecting-ip':ip}}),cookie=session.headers.get('set-cookie').split(';')[0];
   const id=crypto.randomUUID(),accepted=await mf.dispatchFetch('https://offline.invalid/api/guest/research',{method:'POST',headers:{cookie,origin:'https://offline.invalid','cf-connecting-ip':ip,'Content-Type':'application/json'},body:JSON.stringify({request_id:id,question})});assert.equal(accepted.status,202,await accepted.clone().text());
   assert.equal((await mf.dispatchFetch('https://offline.invalid/process')).status,204);
   const progress=await(await mf.dispatchFetch('https://offline.invalid'+(await accepted.json()).poll_url,{headers:{cookie}})).json();assert.equal(progress.status,expected);assert.equal(progress.entries.length,1);assert.equal(progress.entries[0].event.type,expected==='completed'?'answer_completed':'provider_error');
   assert.equal((await db.prepare('SELECT sealed_input FROM research_jobs WHERE id=?').bind(id).first()).sealed_input,'');
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM guest_research_reservations').first()).n,2);assert.equal(outbound,0);
  console.log('workerd queue -> SQLite Durable Object -> single research dispatch passed; simulated Object failure closed without replay; quota counts preserved; zero external/provider calls.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
