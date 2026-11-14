import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {hashPassword,now,day} from '../src/core.js';
const built=spawnSync(process.execPath,['build.mjs'],{stdio:'inherit'});if(built.status)process.exit(built.status);
const mf=new Miniflare({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-07-30',d1Databases:{DB:'tel-os-local'},d1Persist:'.mf',host:'127.0.0.1',port:4173});
const db=await mf.getD1Database('DB');
await db.exec((await readFile('dist/schema.sql','utf8')).replaceAll('\n',' '));
const count=await db.prepare('SELECT COUNT(*) n FROM users').first();
if(!count.n){
 try{await db.exec((await readFile('.private-seed.sql','utf8')).replaceAll('\n',' '));console.log('Loaded local copy of the provisioned team.');}
 catch(e){if(e.code!=='ENOENT')throw e;const s='0123456789abcdef0123456789abcdef',hash=await hashPassword('Local!Development2026',s);for(const [uid,name,role,department,manager] of [['dev-admin','Development Admin','founder','Leadership',null],['dev-member','Development Member','employee','Marketing','dev-admin']])await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(uid,uid,uid,name,role,role,department,manager,day(),hash,s,now()).run();console.log('Local fixtures: dev-admin / dev-member, password Local!Development2026. These accounts exist only in local Miniflare.');}
}
console.log('TEL OS local preview: '+await mf.ready);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await mf.dispose();process.exit();});
