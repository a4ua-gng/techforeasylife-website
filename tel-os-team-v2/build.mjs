import {build} from 'esbuild';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
const assets={__HTML__:await readFile('public/index.html','utf8'),__CSS__:await readFile('public/styles.css','utf8'),__APP__:await readFile('public/app.js','utf8')};
const binaries={};
async function collect(dir){for(const entry of await readdir('public/'+dir,{withFileTypes:true})){const path=dir?dir+'/'+entry.name:entry.name;if(entry.isDirectory())await collect(path);else if(!['index.html','styles.css','app.js'].includes(path)){const data=await readFile('public/'+path);const ext=path.split('.').pop();binaries['/'+path]={base64:data.toString('base64'),type:({webp:'image/webp',ttf:'font/ttf',woff:'font/woff',txt:'text/plain; charset=utf-8',svg:'image/svg+xml',js:'application/javascript; charset=utf-8'})[ext]||'application/octet-stream'};}}}
await collect('');
assets.__BINARY_ASSETS__=binaries;
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/worker.js',define:Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,JSON.stringify(v)])),minify:false});
const schema=(await Promise.all(['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql'].map(f=>readFile(f,'utf8')))).join('\n');
await writeFile('dist/schema.sql',schema);
console.log('Built Worker, frontend assets, and idempotent schema.');
