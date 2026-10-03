import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {inventoryScenarios} from './support/phase4b-scenarios.mjs';
test('4B: PostgreSQL local, precisión, operaciones, permisos y compatibilidad 4A',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const users={admin:randomUUID(),member:randomUUID()};await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[users.admin,users.member,'four-b-admin@example.test','four-b-member@example.test']);await db.query("update public.profiles set role='admin' where id=$1",[users.admin]);
 async function as(who){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[who]]);}
 const h={rpc:async(who,name,args)=>{await as(who);try{const values=Object.values(args),bindings=Object.keys(args).map((key,i)=>key+' => $'+(i+1)).join(',');const r=await db.query(`select public.${name}(${bindings}) as value`,values);return {data:r.rows[0].value,error:null};}catch(e){return {error:{code:e.code,message:e.message}};}},
 rows:async(who,table,key,value)=>{await as(who);return (await db.query(`select * from public.${table} where ${key}=$1`,[value])).rows;},
 client:async(name)=>{await as('admin');return (await db.query('insert into public.clients(name) values($1) returning id',[name])).rows[0].id;},
 materialActive:async(id,active)=>{await as('admin');await db.query('update public.materials set is_active=$2 where id=$1',[id,active]);}};
 const result=await inventoryScenarios(h);assert.ok(result.evidence.length>=20);
 await db.exec('reset role');await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4b-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase4b-schema.sql','utf8'))).rows[0].fingerprint));
 const reconstructed=(await db.query(await readFile('tests/sql/phase4b-reconstruction.sql','utf8'))).rows[0];for(const [key,value] of Object.entries(reconstructed))if(key!=='movements')assert.equal(Number(value),0,key);
 // Fallo inducido local: auditoría y movimiento deben revertirse juntos.
 await db.exec('reset role');await db.exec("create function private.fail_inventory_test() returns trigger language plpgsql as $$begin raise exception 'Fallo de auditoría inducido';end $$;create trigger fail_inventory_test before insert on public.audit_log for each row execute function private.fail_inventory_test();");
 const m=result.ids.materials[0],before=await h.rows('admin','inventory_stock_read','id',m);
 const args=await result.helpers.args('adjustment_negative',m,{quantity:'0.01'});const failed=await h.rpc('admin','inventory_operation',args);assert.equal(failed.error.code,'P0001');assert.deepEqual(await h.rows('admin','inventory_stock_read','id',m),before);
 }finally{await db.close();}
});
