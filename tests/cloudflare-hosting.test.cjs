const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');
const campaign = 'a'.repeat(64);
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync('cloudflare/judge-schema.sql','utf8'));
  const adapter = { withSession: () => adapter, prepare(sql) { return { bind(...values) { return { async first() { return sqlite.prepare(sql).get(...values) || null; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; } }; } }; } };
  const initial = {version:1,codeHash:campaign,used:0,attempts:0,window:Date.now(),lastAttempt:0,reservations:[]};
  const seed = (state = initial) => sqlite.prepare('INSERT INTO judge_ledger(campaign,state) VALUES(?,?)').run(campaign,JSON.stringify(state));
  const module = loadTs('src/lib/judge/d1-ledger.ts',{'@opennextjs/cloudflare':{getCloudflareContext:()=>({env:{JUDGE_QUOTA:adapter}})}});
  return {sqlite,adapter,seed,initial,...module};
}
test('durable judge storage caps concurrent capacity and rejects duplicate requests across instances',async()=>{
  const db=database(); db.seed();
  try {
    const reserve=id=>db.updateDurableLedger(db.adapter,campaign,ledger=>{
      if(ledger.used>=3||ledger.reservations.some(r=>r.id===id))return false;
      ledger.used++; ledger.reservations.push({id,at:new Date().toISOString(),kind:'offline'}); return true;
    });
    const results=await Promise.all(Array.from({length:8},(_,i)=>reserve('request-'+i)));
    assert.equal(results.filter(Boolean).length,3);
    assert.equal(await reserve('request-0'),false);
    const reloaded=JSON.parse(db.sqlite.prepare('SELECT state FROM judge_ledger').get().state);
    assert.equal(reloaded.used,3); assert.equal(reloaded.reservations.length,3);
  } finally {db.sqlite.close();}
});
test('missing and corrupt durable quota rows fail closed without creating or resetting capacity',async()=>{
  const db=database();
  try {
    await assert.rejects(db.withDurableJudgeLedger(campaign,()=>true),/unavailable/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM judge_ledger').get().n,0);
    db.seed({...db.initial,used:2});
    await assert.rejects(db.withDurableJudgeLedger(campaign,()=>true),/Invalid/);
    assert.equal(JSON.parse(db.sqlite.prepare('SELECT state FROM judge_ledger').get().state).used,2);
  } finally {db.sqlite.close();}
});
test('Workers source transport rejects private DNS, private redirects and oversized streams',async()=>{
  const original=global.fetch; let calls=0;
  const reader=loadTs('src/lib/research/source-reader.ts',{'node:dns/promises':{resolve4:async host=>host==='private.invalid.com'?['127.0.0.1']:['93.184.216.34'],resolve6:async()=>[]}});
  try {
    global.fetch=async()=>{calls++;return new Response('ok',{headers:{'Content-Type':'text/plain'}})};
    await assert.rejects(reader.workerSourceBytes('https://private.invalid.com',new AbortController().signal),/private/);
    assert.equal(calls,0);
    global.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});
    await assert.rejects(reader.workerSourceBytes('https://public.domain.com',new AbortController().signal),/Private/);
    global.fetch=async()=>new Response(new Uint8Array(1_500_001),{headers:{'Content-Type':'text/plain'}});
    await assert.rejects(reader.workerSourceBytes('https://public.domain.com',new AbortController().signal),/size limit/);
    global.fetch=async()=>new Response('bounded public text',{headers:{'Content-Type':'text/plain'}});
    const result=await reader.workerSourceBytes('https://public.domain.com',new AbortController().signal);
    assert.equal(result.bytes.toString(),'bounded public text');
  } finally {global.fetch=original;}
});
