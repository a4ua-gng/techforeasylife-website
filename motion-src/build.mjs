import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
await build({
 entryPoints:['motion-src/hover-entry.jsx'],bundle:true,format:'iife',target:['es2020'],
 outfile:'tel-motion-vendor.js',minify:true,jsx:'automatic',legalComments:'eof',
 define:{'process.env.NODE_ENV':'"production"'}
});
const notices=['TEL website animation dependencies\n'];
for(const [name,file] of [
 ['React Bits MicroSlats, FluxLines, ShapeWaves, LogoLoop and ElectricLogo — David Haz','motion-src/LICENSE-ReactBits.txt'],
 ['React','node_modules/react/LICENSE'],['React DOM','node_modules/react-dom/LICENSE'],
 ['Lenis — darkroom.engineering','node_modules/lenis/LICENSE'],
 ['OGL — package declares SPDX Unlicense','motion-src/LICENSE-OGL.txt'],['VGPU','node_modules/vgpu/LICENSE']
])notices.push('\n'+name+'\n'+await readFile(file,'utf8'));
await writeFile('third-party-notices.txt',notices.join('\n'));
console.log('Built self-hosted animation bundle and licence notices.');
