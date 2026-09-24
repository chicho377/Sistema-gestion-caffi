import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration='20260923210849_phase3b_order_constraints.sql';
async function legacy(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));await db.exec((await readFile('tests/sql/phase3a-verification.sql','utf8')).replace(/rollback;\s*$/,'commit;'));return db;}
const newColumns=['number_year','number_sequence','deposit_percentage_override','deposit_percentage_applied','deposit_required_amount','commercial_revision','zero_total_authorized_revision'];
test('3B CHECKs: exactamente ocho reemplazos, datos/auditoría/permisos preservados',async()=>{
const db=await legacy();try{
const before=(await db.query('select to_jsonb(o) as row from public.orders o order by id')).rows;
const audit=(await db.query('select to_jsonb(a) as row from public.audit_log a order by id')).rows;
const acl=(await db.query("select relname,relacl,relrowsecurity from pg_class where oid in ('public.orders'::regclass,'public.order_items'::regclass,'public.order_files'::regclass) order by relname")).rows;
const sql=await readFile('supabase/migrations/'+migration,'utf8');
assert.equal((sql.match(/drop constraint [a-z_0-9]+ restrict/g)||[]).length,8);
assert.equal((sql.match(/\bdrop\b/gi)||[]).length,8);
assert.equal(/\bcascade\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i.test(sql),false);
await db.exec(sql);
const after=(await db.query('select to_jsonb(o) as row from public.orders o order by id')).rows.map(({row})=>({row:Object.fromEntries(Object.entries(row).filter(([k])=>!newColumns.includes(k)))}));
assert.deepEqual(after,before);assert.deepEqual((await db.query('select to_jsonb(a) as row from public.audit_log a order by id')).rows,audit);
assert.deepEqual((await db.query("select relname,relacl,relrowsecurity from pg_class where oid in ('public.orders'::regclass,'public.order_items'::regclass,'public.order_files'::regclass) order by relname")).rows,acl);
assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='public.orders'::regclass and conname like 'orders_3b_%' and convalidated")).rows[0].n,8);
}finally{await db.close();}});
test('3B CHECKs: fila incompatible causa rollback sin reparar historia',async()=>{
const db=await legacy();try{
await db.exec("update public.orders set cancel_reason=null where production_status='cancelled'");
const sql=await readFile('supabase/migrations/'+migration,'utf8');
await assert.rejects(()=>db.exec(sql));await db.exec('rollback');
assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='public.orders'::regclass and conname like 'orders_3b_%'")).rows[0].n,0);
assert.equal((await db.query("select count(*)::int n from public.orders where production_status='cancelled' and cancel_reason is null")).rows[0].n,1);
}finally{await db.close();}});
