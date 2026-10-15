import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {shipmentScenarios} from './support/phase4d-scenarios.mjs';
test('4D: PostgreSQL local, ciclo, permisos, cronología e idempotencia',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const users={admin:randomUUID(),member:randomUUID()};await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[users.admin,users.member,'shipping-admin@example.test','shipping-member@example.test']);await db.query("update public.profiles set role='admin' where id=$1",[users.admin]);
 const as=async who=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[who]]);};
 const r=await shipmentScenarios({rpc:async(who,name,args)=>{await as(who);try{const r=await db.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) as value`,Object.values(args));return {data:r.rows[0].value,error:null};}catch(e){return {error:{code:e.code,message:e.message}};}},rows:async(who,table,key,v)=>{await as(who);return (await db.query(`select * from public.${table} where ${key}=$1`,[v])).rows;},client:async name=>{await as('admin');return (await db.query('insert into public.clients(name) values($1) returning id',[name])).rows[0].id;}});
 assert.ok(r.evidence.length>=30);
 await db.exec('reset role');await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4d-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase4d-schema.sql','utf8'))).rows[0].fingerprint));await db.exec(await readFile('tests/sql/phase4d-rollback.sql','utf8'));
 }finally{await db.close();}
});
