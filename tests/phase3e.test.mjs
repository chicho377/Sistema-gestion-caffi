import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('3E: entrega privada de imágenes solo modifica dos policies; conserva contratos 3A–3D',async()=>{
 const db=new PGlite();
 try {
  await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
  const fingerprints=async()=>Promise.all(['3a','3b','3c','3d'].map(async p=>(await db.query(await readFile(`tests/sql/phase${p}-schema.sql`,'utf8'))).rows));
  let before;
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
   if(f.includes('phase3e')&&!before)before=await fingerprints();
   await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  }
  const after=await fingerprints();
  for(let i=0;i<4;i++){const b=before[i][0].fingerprint,a=after[i][0].fingerprint;for(const k of Object.keys(b))if(k!=='policies')assert.deepEqual(a[k],b[k],`Contrato ${i}/${k}`);}
  assert.deepEqual((await db.query("select policyname,qual from pg_policies where schemaname='storage' order by policyname")).rows,[{policyname:'catalog_images_read',qual:'false'},{policyname:'expense_receipts_read',qual:'false'},{policyname:'order_references_read',qual:'false'}]);
  await mkdir('test-results',{recursive:true});
  const schema=(await db.query(await readFile('tests/sql/phase3e-schema.sql','utf8'))).rows[0].fingerprint;
  assert.equal(schema.rls,true);assert.equal(schema.unvalidated,0);assert.equal(schema.unsafe_definers,0);
  await writeFile('test-results/phase3e-local-schema.json',JSON.stringify(schema,null,2));
  await db.exec(await readFile('tests/sql/phase3e-atomicity.sql','utf8'));
 } finally {await db.close();}
});
