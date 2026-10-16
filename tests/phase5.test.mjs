import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('5: cálculo decimal, snapshots, permisos y reconciliación PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('tests/phase3a.test.mjs','utf8')).match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
 const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const f of files.filter(f=>!f.includes('phase5')))await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const admin=randomUUID(),member=randomUUID();await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[admin,member,'cost-admin@example.test','cost-member@example.test']);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 const client=(await db.query("insert into public.clients(name) values('Costeo') returning id")).rows[0].id;
 const product=(await db.query("insert into public.products(sku,name,base_price,estimated_minutes) values('COST','Producto',10,12) returning id")).rows[0].id;
 const rpc=async(name,args)=>(await db.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) as value`,Object.values(args))).rows[0].value;
 const quote=async(discount='0',price='10',count=3)=>{const id=randomUUID(),items=Array.from({length:count},()=>({id:randomUUID(),product_id:product,quantity:'1',unit_price:price,discount_amount:'0',is_active:true}));await rpc('save_quote',{target:id,expected_revision:0,payload:{client_id:client,order_date:'2025-01-01',requested_delivery_date:'2025-02-01',discount_amount:discount,items}});return {id,items};};
 const confirm=async(id)=>rpc('confirm_order',{target:id,expected_revision:1,payload:{confirmed_at:'2025-01-01T12:00:00Z',deposit_percentage:'0',zero_reason:'Caso autorizado'}});
 const legacy=await quote();await confirm(legacy.id);
 for(const f of files.filter(f=>f.includes('phase5')))await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 assert.equal((await db.query('select count(*)::int n from public.order_items where order_id=$1 and estimate_captured_at is not null',[legacy.id])).rows[0].n,0);
 const o=await quote('0.01','0.01');await confirm(o.id);
 assert.equal((await db.query('select estimated_minutes_snapshot n from public.order_items where id=$1',[o.items[0].id])).rows[0].n,12);
 await db.query('update public.products set estimated_minutes=90 where id=$1',[product]);
 assert.equal((await db.query('select estimated_minutes_snapshot n from public.order_items where id=$1',[o.items[0].id])).rows[0].n,12);
 let c=await rpc('order_costing',{target:o.id});assert.equal(c.revenue,'0.02');assert.equal(c.lines.reduce((a,l)=>a+Math.round(Number(l.revenue)*100),0),2);
 const category=randomUUID();await rpc('save_expense_category',{target:category,expected_revision:0,payload:{name:'Costo',is_active:true}});
 await rpc('register_expense',{target:randomUUID(),payload:{category_id:category,amount:'0.05',currency:'CRC',description:'Compartido',order_id:o.id}});
 c=await rpc('order_costing',{target:o.id});assert.equal(c.profit,'-0.03');assert.equal(c.margin_percent,'-150.00');assert.equal(c.lines.reduce((a,l)=>a+Math.round(Number(l.total_cost)*100),0),5);assert.equal(Number(c.unallocated_order_cost),0);
 const zero=await quote('0','0',1);await confirm(zero.id);await rpc('register_expense',{target:randomUUID(),payload:{category_id:category,amount:'1.01',currency:'CRC',description:'Sin ingreso',order_id:zero.id}});
 c=await rpc('order_costing',{target:zero.id});assert.equal(c.margin_percent,null);assert.equal(c.profit,'-1.01');assert.equal(c.unallocated_order_cost,'1.01');
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);await assert.rejects(()=>rpc('order_costing',{target:o.id}),e=>e.code==='42501');await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 await assert.rejects(()=>db.query('update public.order_items set estimated_minutes_snapshot=99 where id=$1',[o.items[0].id]),e=>e.code==='42501');

 await db.query('update public.settings set hourly_rate=1 where singleton');
 await rpc('transition_order',{target:zero.id,expected_revision:2,payload:{state:'in_production'}});
 const running=randomUUID();await rpc('work_operate',{request_id:randomUUID(),operation:'start',target:running,expected_revision:null,payload:{order_id:zero.id}});
 c=await rpc('order_costing',{target:zero.id});assert.equal(c.complete,false);assert.equal(c.profit,null);assert.ok(c.warnings[0].includes('Sesión abierta'));
 await rpc('work_operate',{request_id:randomUUID(),operation:'finish',target:running,expected_revision:1,payload:{}});
 await db.query('update public.products set estimated_minutes=null where id=$1',[product]);const missing=await quote();await confirm(missing.id);assert.equal((await rpc('order_costing',{target:missing.id})).lines[0].estimated_minutes,null);
 const custom=randomUUID();await rpc('save_quote',{target:custom,expected_revision:0,payload:{client_id:client,order_date:'2025-01-01',requested_delivery_date:'2025-02-01',discount_amount:'0',items:[{id:randomUUID(),product_name_snapshot:'Personalizado',quantity:'1',unit_price:'1',discount_amount:'0',is_active:true}]}});await confirm(custom);assert.equal((await rpc('order_costing',{target:custom})).lines[0].estimated_minutes,null);
 await rpc('transition_order',{target:custom,expected_revision:2,payload:{state:'cancelled',reason:'Prueba'}});c=await rpc('order_costing',{target:custom});assert.equal(c.revenue,null);assert.ok(c.lines.every(l=>l.revenue===null));
 const precision=await quote('0','1',7);await confirm(precision.id);await rpc('work_operate',{request_id:randomUUID(),operation:'historical',target:randomUUID(),expected_revision:null,payload:{order_id:precision.id,user_id:admin,started_at:'2025-01-02T12:00:00Z',finished_at:'2025-01-02T12:01:00Z',hourly_rate:'0.90',reason:'Precision',pauses:[]}});c=await rpc('order_costing',{target:precision.id});assert.equal(c.labor_cost,'0.02');assert.equal(Number(c.unallocated_order_cost),0);
 await db.exec(await readFile('tests/sql/phase5-rollback.sql','utf8'));
 await writeFile('test-results/phase5-local-schema.json',JSON.stringify((await db.query(await readFile('tests/sql/phase5-schema.sql','utf8'))).rows[0].fingerprint));
 }finally{await db.close();}
});
