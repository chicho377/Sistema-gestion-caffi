import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('3D: gastos, moneda, fallback, permisos y conservación de originales',async()=>{
 const db=new PGlite();
 try {
  await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
  let before;
  const fingerprint=async()=>Promise.all(['3b','3c'].map(async phase=>(await db.query(await readFile(`tests/sql/phase${phase}-schema.sql`,'utf8'))).rows));
  for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) {
   if(file.includes('phase3d')&&!before) before=await fingerprint();
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  }
  assert.deepEqual(await fingerprint(),before,'3D conserva los contratos de 3B y 3C');
  await db.exec(await readFile('tests/sql/phase3d-verification.sql','utf8'));
  await db.exec(await readFile('tests/sql/phase3d-permissions.sql','utf8'));
  await db.exec(await readFile('tests/sql/phase3d-rates-storage-local.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from public.expenses')).rows[0].n,0);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/phase3d-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase3d-schema.sql','utf8'))).rows));
 } finally {await db.close();}
});
