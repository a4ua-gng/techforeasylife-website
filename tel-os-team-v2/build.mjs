import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const assets={__HTML__:await readFile('public/index.html','utf8'),__CSS__:await readFile('public/styles.css','utf8'),__APP__:await readFile('public/app.js','utf8')};
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/worker.js',define:Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,JSON.stringify(v)])),minify:false});
const schema=(await Promise.all(['schema-core.sql','schema-workflows.sql','schema-collaboration.sql'].map(f=>readFile(f,'utf8')))).join('\n');
await writeFile('dist/schema.sql',schema);
console.log('Built Worker, frontend assets, and idempotent schema.');
