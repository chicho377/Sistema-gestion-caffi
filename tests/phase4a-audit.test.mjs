import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('4A auditoría: tasas controladas, domains e historia sin mutación persistida',async()=>{
 const db=new PGlite();try{
  await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec("insert into auth.users(id,email) values('44000000-0000-4000-8000-000000000001','audit4a@example.test');update public.profiles set role='admin' where id='44000000-0000-4000-8000-000000000001'");
  const result=await db.exec(await readFile('tests/sql/phase4a-audit-rates.sql','utf8'));assert.match(result.at(-1).rows[0].result,/PASS/);
  assert.equal((await db.query('select count(*)::int n from public.inventory_receipts')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.exchange_rates')).rows[0].n,0);
 }finally{await db.close();}
});
