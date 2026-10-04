import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {workScenarios} from './support/phase4c-scenarios.mjs';
test('4C: sesiones PostgreSQL local, tarifa, pausas, historia y protección 3B',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 const functionSql="select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as key,pg_get_functiondef(p.oid) as definition,p.proacl::text as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by key";
 const triggerSql="select tgrelid::regclass::text||'.'||tgname as key,pg_get_triggerdef(oid) as definition,tgenabled from pg_trigger where not tgisinternal order by key";
 let oldFunctions,oldTriggers;
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
 if(file.includes('phase4c')&&!oldFunctions){oldFunctions=(await db.query(functionSql)).rows;oldTriggers=(await db.query(triggerSql)).rows;}
 await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 }
 const afterFunctions=(await db.query(functionSql)).rows,afterTriggers=(await db.query(triggerSql)).rows;
 for(const f of oldFunctions)assert.deepEqual(afterFunctions.find(x=>x.key===f.key),f,'Contrato previo '+f.key);
 for(const t of oldTriggers)assert.deepEqual(afterTriggers.find(x=>x.key===t.key),t,'Trigger previo '+t.key);
 const users={admin:randomUUID(),member:randomUUID()};await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[users.admin,users.member,'hours-admin@example.test','hours-member@example.test']);await db.query("update public.profiles set role='admin' where id=$1",[users.admin]);
 const as=async who=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[who]]);};
 const setRate=async value=>{await as('admin');try{await db.query('update public.settings set hourly_rate=$1',[value]);return {error:null};}catch(e){return {error:e};}};
 const result=await workScenarios({users,setRate,rate:async v=>{assert.equal((await setRate(v)).error,null);},rpc:async(who,name,args)=>{await as(who);try{const r=await db.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) as value`,Object.values(args));return {data:r.rows[0].value,error:null};}catch(e){return {error:{code:e.code,message:e.message}};}},rows:async(who,table,key,v)=>{await as(who);return (await db.query(`select * from public.${table} where ${key}=$1`,[v])).rows;},client:async name=>{await as('admin');return (await db.query('insert into public.clients(name) values($1) returning id',[name])).rows[0].id;}});
 assert.ok(result.evidence.length>20);
 await db.exec('reset role');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4c-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase4c-schema.sql','utf8'))).rows[0].fingerprint));
 const mismatches=await db.query('select count(*)::integer as n from public.work_sessions s where status=\'finished\' and worked_seconds is distinct from private.work_seconds(id,finished_at)');assert.equal(mismatches.rows[0].n,0);
 }finally{await db.close();}
});
