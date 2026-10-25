import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const failures=[];
const origin=new URL(config.vars?.ORIGIN||'http://invalid');
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.hostname.endsWith('.example')||origin.hostname==='localhost')failures.push('Set ORIGIN to the real canonical HTTPS origin.');
if(!config.vars?.SENDER||/example|your-verified/.test(config.vars.SENDER))failures.push('Set SENDER to an address on your verified Cloudflare Email domain.');
for(const db of config.d1_databases??[])if(!db.database_id||/^0[-0]*$/.test(db.database_id))failures.push('Configure the real Palim D1 database ID.');
for(const kv of config.kv_namespaces??[])if(!kv.id||/^0+$/.test(kv.id))failures.push('Configure the real OAuth KV namespace ID.');
for(const candidate of (config.vars?.FILE_ORIGINS||'').split(',').filter(Boolean)){const host=new URL(candidate.trim());if(host.protocol!=='https:'||host.origin!==candidate.trim()||host.username||host.password)failures.push('Each FILE_ORIGINS value must be an exact HTTPS origin without a path.');}
if(failures.length)throw new Error(`Deployment configuration is incomplete:\n${failures.map(f=>' - '+f).join('\n')}`);
console.log('Static deployment configuration passed. This does not verify account permissions, remote bindings, runtime secrets, sender verification or Kindle delivery. Follow docs/deployment.md.');
