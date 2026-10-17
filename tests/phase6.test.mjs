import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
test('6: reportes, permisos y segundos conciliados en PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const admin='aaaaaaaa-1111-4111-8111-111111111111',member='bbbbbbbb-1111-4111-8111-111111111111';
 await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[admin,member,'report-admin@example.test','report-member@example.test']);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 for(const kind of ['orders','balances','payments','cash','profit','inventory','movements','hours','shipments','audit','operation']){
 const r=await db.query("select public.report_query($1,'2026-01-01','2026-01-31') r",[kind]);assert.ok(Array.isArray(r.rows[0].r.rows),kind);
 }
 await db.query("select public.dashboard_query('2026-01-01','2026-01-31')");
 const client=(await db.query("insert into public.clients(name) values('REPORT-6') returning id")).rows[0].id;
 const order=randomUUID(),line=randomUUID(),session=randomUUID();
 await db.query("select public.save_quote($1,0,$2)",[order,{client_id:client,order_date:'2026-01-01',requested_delivery_date:'2026-02-20',discount_amount:'0',items:[{id:line,product_name_snapshot:'Personalizado',quantity:'1',unit_price:'10',discount_amount:'0',is_active:true}]}]);
 await db.query("select public.confirm_order($1,1,$2)",[order,{confirmed_at:'2026-01-01T12:00:00Z',deposit_percentage:'0'}]);
 await db.query("select public.work_operate($1,'historical',$2,null,$3)",[randomUUID(),session,{order_id:order,order_item_id:line,user_id:admin,started_at:'2026-02-01T05:59:59.600Z',finished_at:'2026-02-01T06:00:02.200Z',hourly_rate:'10.00',reason:'Prueba límites',pauses:[]}]);
 const before=(await db.query("select public.report_query('hours','2026-01-31','2026-01-31') r")).rows[0].r;
 const after=(await db.query("select public.report_query('hours','2026-02-01','2026-02-01') r")).rows[0].r;
 const all=(await db.query("select public.report_query('hours','2026-01-31','2026-02-01') r")).rows[0].r;
 assert.equal(BigInt(before.summary.segundos_periodo)+BigInt(after.summary.segundos_periodo),2n);assert.equal(all.summary.segundos_periodo,'2');
 assert.equal(before.rows[0].estimacion_estado,'Estimación histórica no disponible');
 await db.query("select public.report_charts('2026-01-01','2026-02-28')");
 const frozen=(await db.query('select * from public.work_sessions where id=$1',[session])).rows[0];
 await db.query("select public.dashboard_query('2026-01-01','2026-02-28')");
 assert.deepEqual((await db.query('select * from public.work_sessions where id=$1',[session])).rows[0],frozen);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
 for(const kind of ['orders','balances','payments','cash','profit','audit'])await assert.rejects(db.query("select public.report_query($1,'2026-01-01','2026-01-31')",[kind]),e=>e.code==='42501');
 const dash=(await db.query("select public.dashboard_query('2026-01-01','2026-01-31') r")).rows[0].r;assert.equal(dash.cash,undefined);assert.equal(dash.profit,undefined);
 await assert.rejects(db.query("select public.report_query('hours','2026-02-01','2026-01-01')"),e=>e.code==='22023');
 await assert.rejects(db.query("select public.report_query('hours','2026-01-01','2026-01-31','{\"admin\":true}')"),e=>e.code==='22023');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 await db.exec(await readFile('tests/sql/phase6-temporal.sql','utf8'));
 await writeFile('test-results/phase6-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase6-schema.sql','utf8'))).rows[0].fingerprint));
 }finally{await db.close();}
});
