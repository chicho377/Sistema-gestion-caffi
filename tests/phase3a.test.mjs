import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { halfUp, cents, decimal, quantity, totals, money, businessDate, validateDates, deliveryAlert } from "../src/features/orders/domain.ts";
test("3A: decimal exacto, HALF UP por línea y entradas inválidas", () => {
 assert.equal(halfUp("0.125"),"0.13"); assert.equal(halfUp("1.005"),"1.01");
 // Contrato de redondeo: estas fracciones NO son entradas comerciales admisibles.
 assert.equal(decimal(cents(halfUp("0.125"))+cents(halfUp("0.125"))),"0.26");
 assert.equal(halfUp("0.250"),"0.25");
 for(const value of ["0.125","-1","NaN","Infinity","1e2",""]) assert.throws(()=>cents(value));
 for(const value of ["0","-1","1.1","NaN","Infinity","2147483648"]) assert.throws(()=>quantity(value));
 const rows=[{quantity:"3",unit_price:"0.10",discount_amount:"0.01",is_active:true},{quantity:"1",unit_price:"1.00",discount_amount:"0",is_active:false}];
 assert.deepEqual(totals(rows,"0.02"),{subtotal:"0.29",total:"0.27",lines:["0.29","1.00"]});
 assert.throws(()=>totals(rows,"0.30"));
 assert.equal(decimal(cents("9007199254740993.01")),"9007199254740993.01");
 const large=totals([{quantity:"2",unit_price:"9".repeat(100),discount_amount:"0",is_active:true}],"0");
 assert.equal(money(large.total).replace(/[₡.]/g, "").replace(",", "."), "1"+"9".repeat(99)+"8.00");
 assert.equal(money("00012.5"),"₡12,50");
});
test("3A: Costa Rica, medianoche, cronología y alertas",()=>{
 assert.equal(businessDate(new Date("2026-09-23T05:59:59Z")),"2026-09-22");
 assert.equal(businessDate(new Date("2026-09-23T06:00:00Z")),"2026-09-23");
 const now=new Date("2026-09-23T12:00:00Z");
 assert.throws(()=>validateDates("2026-09-24","2026-09-25",true,undefined,now));
 assert.throws(()=>validateDates("2026-09-22","2026-09-23",false,undefined,now));
 assert.throws(()=>validateDates("2026-09-23","2026-09-22",true,undefined,now));
 validateDates("2026-09-22","2026-09-22",true,undefined,now);
 validateDates("2026-09-22","2026-09-23",false,"2026-09-22",now);
 for(const d of [29,30]) assert.equal(deliveryAlert(`2026-09-${d}`,"quote","2026-09-23").tone,"warning");
 for(const d of [23,24,28]) assert.equal(deliveryAlert(`2026-09-${d}`,"quote","2026-09-23").tone,"danger");
 assert.match(deliveryAlert("2026-09-21","quote","2026-09-23").text,/2 días/);
 assert.equal(deliveryAlert("2026-09-21","cancelled","2026-09-23"),null);
 assert.equal(deliveryAlert("2026-10-01","quote","2026-09-23"),null);
});
test("3A: PostgreSQL local real, atomicidad, snapshots, permisos y terminalidad",async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.exec(await readFile('tests/sql/phase3a-verification.sql','utf8'));
 const schema=await db.query(await readFile("tests/sql/phase3a-schema.sql","utf8"));
 await mkdir("test-results",{recursive:true});await writeFile("test-results/phase3a-local-schema.json",JSON.stringify(schema.rows[0].fingerprint,null,2));
 const records=await db.query("select count(*)::int as n from public.orders");
 assert.equal(records.rows[0].n,0,"Pruebas revierten únicamente su propia transacción");
 } finally { await db.close(); }
});
