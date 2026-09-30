import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('3C: ingresos administrativos, RLS, inmutabilidad, auditoría y rollback', async () => {
 const db = new PGlite();
 try {
  const prior = await readFile('tests/phase3a.test.mjs','utf8');
  await db.exec(prior.match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
  let before;
  for (const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) {
   if (file.includes('phase3c')) before=(await db.query(await readFile('tests/sql/phase3b-schema.sql','utf8'))).rows;
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  }
  assert.deepEqual((await db.query(await readFile('tests/sql/phase3b-schema.sql','utf8'))).rows,before,'3C no altera objetos de 3B');
  await db.exec(await readFile('tests/sql/phase3c-verification.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from public.manual_income')).rows[0].n,0);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/phase3c-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase3c-schema.sql','utf8'))).rows));
 } finally { await db.close(); }
});
