import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,database=process.env.D1_DATABASE_ID,token=process.env.CLOUDFLARE_API_TOKEN,name=process.env.TEL_WORKER_NAME||'tel-os-team-v2';
if(!account||!database||!token)throw Error('Set CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and CLOUDFLARE_API_TOKEN. Use the dedicated TEL OS team database.');
if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid Worker name.');
const built=spawnSync(process.execPath,['build.mjs'],{stdio:'inherit'});if(built.status)process.exit(built.status);
async function api(path,method,body){const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});const data=await response.json();if(!response.ok||data.success===false)throw Error('Cloudflare API failed: '+response.status+' '+JSON.stringify(data.errors));return data;}
await api(`/accounts/${account}/d1/database/${database}/query`,'POST',{sql:await readFile('dist/schema.sql','utf8')});
// Credentials are provisioned separately; deployment never resets staff passwords or replaces team data.
const metadata={main_module:'worker.js',compatibility_date:'2026-11-14',bindings:[{type:'d1',name:'DB',database_id:database}],observability:{enabled:true,redact_query_string:true,logs:{enabled:true,invocation_logs:true,persist:true},traces:{enabled:true,persist:true,head_sampling_rate:1}}};
const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('worker.js',new Blob([await readFile('dist/worker.js','utf8')],{type:'application/javascript+module'}),'worker.js');
await api(`/accounts/${account}/workers/scripts/${name}`,'PUT',form);
await api(`/accounts/${account}/workers/scripts/${name}/subdomain`,'POST',{enabled:true,previews_enabled:false});
await api(`/accounts/${account}/workers/scripts/${name}/schedules`,'PUT',[{cron:'*/15 * * * *'}]);
console.log('TEL OS Worker and 15-minute automation schedule deployed.');
