// OpenNext embeds Next env files. Build in an isolated source tree containing
// no env files and give its child process ONLY the two public browser settings.
// Runtime secrets are provisioned separately through Wrangler's stdin.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root=process.cwd(),stage=path.join(root,'.redesign-backup','cloudflare-safe-source');
const childEnv={...process.env};
const loaded=require('@next/env').loadEnvConfig(root).combinedEnv;
for(const name of Object.keys(childEnv))if(/API_KEY|SECRET|TOKEN|SUPABASE|JUDGE_|^NEXT_PUBLIC_/.test(name))delete childEnv[name];
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'])if(loaded[name])childEnv[name]=loaded[name];
childEnv.FIELDWORK_BUILD_CLOUDFLARE='true';
fs.mkdirSync(stage,{recursive:true});
for(const name of ['src','public','cloudflare','scripts','package.json','package-lock.json','next.config.mjs','open-next.config.ts','wrangler.toml','tsconfig.json','next-env.d.ts','postcss.config.mjs','tailwind.config.ts']){
  const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(stage,name),{recursive:true});
}
// Real file paths are required by Next standalone tracing. Hard links keep an
// isolated module tree without copying dependency contents or any env file.
const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex');
const modules=path.join(stage,'node_modules'),stamp=path.join(stage,'.dependency-digest');
if(!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==digest){
  if(fs.existsSync(modules)){
    if(path.dirname(modules)!==stage||fs.lstatSync(modules).isSymbolicLink())throw Error('Unexpected isolated dependency path');
    fs.rmSync(modules,{recursive:true,force:true});
  }
  function linkTree(source,destination,ancestors=new Set()){
    const real=fs.realpathSync(source);if(ancestors.has(real))throw Error('Cyclic dependency link');
    const next=new Set(ancestors);next.add(real);fs.mkdirSync(destination,{recursive:true});
    for(const entry of fs.readdirSync(source,{withFileTypes:true})){
      const from=path.join(source,entry.name),to=path.join(destination,entry.name),info=fs.statSync(from);
      if(info.isDirectory())linkTree(from,to,next);else if(info.isFile())fs.linkSync(from,to);
    }
  }
  linkTree(path.join(root,'node_modules'),modules);fs.writeFileSync(stamp,digest);
}
console.log('Building an isolated Worker with public browser configuration only.');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/@opennextjs/cloudflare/dist/cli/index.js'),'build',...process.argv.slice(2)],{cwd:stage,stdio:'inherit',env:childEnv});
if(result.error){console.error(result.error.message);process.exit(1);}
if(result.status!==0)process.exit(result.status??1);
const output=path.resolve(root,'.open-next');
if(path.dirname(output)!==root||(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink()))throw Error('Unexpected Worker output path');
fs.rmSync(output,{recursive:true,force:true});
fs.cpSync(path.join(stage,'.open-next'),output,{recursive:true});
const scan=spawnSync(process.execPath,[path.join(root,'scripts/check-worker-secrets.cjs')],{cwd:root,stdio:'inherit',env:childEnv});
process.exit(scan.status??1);
