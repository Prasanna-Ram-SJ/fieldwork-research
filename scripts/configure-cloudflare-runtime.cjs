// Run only after explicit approval to store the existing configuration on
// Cloudflare. Values flow from .env.local to Wrangler stdin, never output/args.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const baseEnv={...process.env};
const values=require('@next/env').loadEnvConfig(process.cwd()).combinedEnv;
const cli=path.resolve('node_modules/wrangler/bin/wrangler.js');
const sqlPath=path.resolve('.redesign-backup/cloudflare-judge-migration.sql');
const ledger=JSON.parse(fs.readFileSync('.redesign-backup/judge-allowance.json','utf8'));
if(ledger.version!==1||ledger.codeHash!==values.JUDGE_ACCESS_CODE_HASH||ledger.used!==ledger.reservations.length)throw Error('Existing local quota ledger does not match the configured campaign');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=`INSERT INTO judge_ledger(campaign,state,revision) VALUES(${quote(ledger.codeHash)},${quote(JSON.stringify(ledger))},0) ON CONFLICT(campaign) DO NOTHING;`;
fs.writeFileSync(sqlPath,sql,{mode:0o600});
try{
const migrated=spawnSync(process.execPath,[cli,'d1','execute','fieldwork-judge-quota','--remote','--file',sqlPath],{env:baseEnv,encoding:'utf8'});
if(migrated.status!==0)throw Error('Durable quota import failed; no runtime secrets uploaded');
}finally{fs.unlinkSync(sqlPath);}
const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','NEBIUS_API_KEY','TAVILY_API_KEY','PROVIDER_REQUESTS_ENABLED','JUDGE_ACCESS_CODE_HASH','JUDGE_SESSION_SECRET','JUDGE_ACCESS_EXPIRES_AT','JUDGE_REQUEST_LIMIT'];
const payload=Object.fromEntries(names.filter(name=>values[name]).map(name=>[name,values[name]]));
if(!payload.NEBIUS_API_KEY||!payload.TAVILY_API_KEY||!payload.SUPABASE_URL||!payload.SUPABASE_ANON_KEY)throw Error('Required local configuration is missing');
const result=spawnSync(process.execPath,[cli,'secret','bulk','--name','fieldwork-research'],{env:baseEnv,input:JSON.stringify(payload),encoding:'utf8'});
// Secret values are never needed to diagnose this operation.
let output=(result.stdout||'')+(result.stderr||'');for(const value of Object.values(payload))if(value.length>10)output=output.replaceAll(value,'[redacted]');
if(result.status!==0){console.error(output);process.exit(result.status??1);}
console.log('Imported the existing judge allowance without resetting it and uploaded runtime configuration as Cloudflare secrets.');
