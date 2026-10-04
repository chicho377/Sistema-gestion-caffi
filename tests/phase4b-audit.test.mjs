import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
test('Auditoría 4B: huella 4A conserva constraints, NOT NULL, funciones y migraciones anteriores',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 const fingerprint=async()=> (await db.query(await readFile('tests/sql/phase4b-schema.sql','utf8'))).rows[0].fingerprint;
 for(const file of files.filter(f=>f<'20261003')){
  const bytes=await readFile('supabase/migrations/'+file);const original=execFileSync('git',['show','aec1fb6:supabase/migrations/'+file]);assert.equal(bytes.toString().replaceAll('\r\n','\n'),original.toString().replaceAll('\r\n','\n'),'Migración 4A/anterior no editada '+file);await db.exec(bytes.toString());
 }
 const before=await fingerprint();const source=(await db.query("select prosrc from pg_proc where oid='private.inventory_receipt_complete()'::regprocedure")).rows[0].prosrc;
 for(const file of files.filter(f=>f>='20261003'))await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const after=await fingerprint(),removed=new Set(['inventory_movements_movement_type_check','inventory_movements_check','inventory_movement_costs_check','inventory_movement_costs_valuation_version_check','inventory_balances_check','inventory_valuations_check']);
 for(const c of before.constraints){const a=after.constraints.find(x=>x.table===c.table&&x.name===c.name);if(removed.has(c.name))assert.equal(a,undefined);else assert.deepEqual(a,c,'Constraint original intacto '+c.name);}
 const nullable=new Set(['inventory_movements.receipt_item_id','inventory_movement_costs.movement_amount_crc','inventory_movement_costs.average_cost_after_crc']);
 for(const c of before.columns){const a=after.columns.find(x=>x.table===c.table&&x.column===c.column);assert.deepEqual(a,nullable.has(c.table+'.'+c.column)?{...c,required:false}:c);}
 for(const f of before.functions){const a=after.functions.find(x=>x.schema===f.schema&&x.name===f.name&&x.args===f.args);assert.deepEqual(f.name==='inventory_receipt_complete'?{...a,body:f.body}:a,f,'Función/grants anterior conservada '+f.name);}
 const updated=(await db.query("select prosrc from pg_proc where oid='private.inventory_receipt_complete()'::regprocedure")).rows[0].prosrc;
 const expected=source.replace('pc.average_cost_after_crc=c.average_cost_before_crc','pc.average_cost_after_crc is not distinct from c.average_cost_before_crc').replace('v.average_unit_cost_crc<>c.average_cost_after_crc','v.average_unit_cost_crc is distinct from c.average_cost_after_crc');
 assert.equal(updated.replace(/\s+/g,' ').trim(),expected.replace(/\s+/g,' ').trim(),'Únicamente dos comparaciones NULL autorizadas');
 }finally{await db.close();}
});
