// Compare in memory only; never print credential values or write another copy.
const fs = require('node:fs'),path=require('node:path');
const env=require('@next/env').loadEnvConfig(process.cwd()).combinedEnv;
const names=Object.keys(env).filter(name=>/API_KEY|SECRET|SERVICE_ROLE|TOKEN/.test(name)&&!name.startsWith('NEXT_PUBLIC_'));
const secrets=names.filter(name=>env[name]).map(name=>({name,value:env[name]}));
const failures=[];
function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){scan(file);continue;}if(/^\.env|^\.dev\.vars/.test(item.name)){failures.push('Environment file in deployment output');continue;}if(!/\.(?:js|mjs|json|html|css|map|txt)$/.test(item.name))continue;const text=fs.readFileSync(file,'utf8');for(const secret of secrets)if(text.includes(secret.value))failures.push(secret.name+' embedded in output');}}
scan(process.argv[2] || '.open-next');
if(failures.length){console.error([...new Set(failures)].join('\n'));process.exit(1);}
console.log('Deployment output contains no provider/session secret values or environment files.');
