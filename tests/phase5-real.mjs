import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[],ids={orders:[]},prefix='VALIDACION-5-'+Date.now();
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
const pennies=x=>{const [a,b='']=x.split('.');return BigInt(a)*100n+BigInt((a.startsWith('-')?'-':'')+b.padEnd(2,'0'));};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const ok=async(name,args,u=admin)=>{const r=await u.client.rpc(name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const row=async(t,id,key='id')=>{const r=await admin.client.from(t).select('*').eq(key,id).single();assert.equal(r.error,null);return r.data;};
 const insert=async(t,p)=>{const r=await admin.client.from(t).insert(p).select('id').single();assert.equal(r.error,null,JSON.stringify(r.error));return r.data.id;};
 const client=await insert('clients',{name:prefix,address:'Prueba histórica'}),product=await insert('products',{sku:prefix,name:prefix,base_price:'10',estimated_minutes:12});
 const category=randomUUID();await ok('save_expense_category',{target:category,expected_revision:0,payload:{name:prefix,is_active:true}});
 const revision=async id=>(await row('orders',id)).revision;
 const quote=async(prices=['10'],discount='0')=>{const id=randomUUID(),items=prices.map(price=>({id:randomUUID(),product_id:product,quantity:'1',unit_price:price,discount_amount:'0',is_active:true}));await ok('save_quote',{target:id,expected_revision:0,payload:{client_id:client,order_date:'1990-01-01',requested_delivery_date:'1990-02-01',discount_amount:discount,notes:prefix,items}});ids.orders.push(id);return {id,items};};
 const confirm=async o=>ok('confirm_order',{target:o.id,expected_revision:await revision(o.id),payload:{confirmed_at:'1990-01-01T12:00:00Z',deposit_percentage:'0',zero_reason:prefix}});
 const state=async(o,value)=>ok('transition_order',{target:o.id,expected_revision:await revision(o.id),payload:{state:value,reason:prefix}});
 const cost=async o=>ok('order_costing',{target:o.id});
 const reconcile=c=>{check(pennies(c.material_cost)+pennies(c.labor_cost)+pennies(c.expense_cost)===pennies(c.total_cost),'Componentes reconcilian '+c.order_id);check(c.lines.reduce((a,l)=>a+pennies(l.total_cost),0n)+pennies(c.unallocated_order_cost)===pennies(c.total_cost),'Líneas y no asignado reconcilian '+c.order_id);if(c.profit!==null)check(pennies(c.revenue)-pennies(c.total_cost)===pennies(c.profit),'Utilidad reconcilia '+c.order_id);};
 const expense=async(o,amount,line=null)=>{const id=randomUUID();await ok('register_expense',{target:id,payload:{category_id:category,amount,currency:'CRC',description:prefix,order_id:o.id,order_item_id:line}});return id;};
 const q=await quote();check((await cost(q)).state==='quote','Cotización no realizada');await confirm(q);check((await row('order_items',q.items[0].id)).estimated_minutes_snapshot===12,'Snapshot al confirmar');await admin.client.from('products').update({estimated_minutes:99}).eq('id',product);check((await row('order_items',q.items[0].id)).estimated_minutes_snapshot===12,'Catálogo no cambia snapshot');
 const materials=await quote(),labor=await quote(),exp=await quote(),mixed=await quote(['0.01','0.01','0.01'],'0.01'),zero=await quote(['0']);
 for(const o of [materials,labor,exp,mixed,zero]){await confirm(o);await state(o,'in_production');}
 const mat=await ok('save_material',{target_id:null,material_code:prefix,material_name:prefix,material_category:'Prueba',material_unit:'gramos',minimum:'0',enabled:true,cost:null,cost_currency:'CRC'});
 const receipt=randomUUID();await ok('register_inventory_receipt',{target:receipt,expected_revisions:{[mat]:'0'},payload:{kind:'purchase',source_reference:prefix,lines:[{material_id:mat,unit:'gramos',quantity:'30',amount:'10',currency:'CRC'}]}});
 const inv=async(operation,payload)=>{const target=randomUUID();await ok('inventory_operation',{target,operation,payload:{material_id:mat,reason:prefix,...payload},expected_revisions:{[mat]:(await row('inventory_balances',mat,'material_id')).revision.toString()},expected_orders:Object.fromEntries(await Promise.all(ids.orders.map(async id=>[id,await revision(id)])))});return target;};
 const consumption=await inv('consumption',{order_id:materials.id,order_item_id:materials.items[0].id,quantity:'3'});let c=await cost(materials);check(c.material_cost==='1.00'&&Number(c.labor_cost)===0&&Number(c.expense_cost)===0,'Solo materiales');reconcile(c);
 await inv('return',{source_movement_id:consumption,attribution_revision:'0',quantity:'1'});c=await cost(materials);check(c.material_cost==='0.67','Devolución reduce costo histórico');
 await inv('attribution_correction',{source_movement_id:consumption,attribution_revision:'0',destination_order_id:mixed.id,destination_order_item_id:mixed.items[0].id});check(Number((await cost(materials)).material_cost)===0&&(await cost(mixed)).material_cost==='0.67','Atribución corregida mueve costo neto y devolución');
 await inv('quantity_correction',{source_movement_id:consumption,attribution_revision:'1',quantity:'2',replacement_quantity:'1'});check((await cost(mixed)).material_cost==='0.33','Corrección de consumo compensa original');
 // Locate a free historical interval rather than overwriting any existing session.
 let start=Date.UTC(1991,0,1);const existing=await admin.client.from('work_sessions').select('started_at,finished_at').eq('user_id',admin.id).gte('started_at','1991-01-01').lt('started_at','1992-01-01');assert.equal(existing.error,null);
 while(existing.data.some(s=>Date.parse(s.started_at)<start+7200000&&Date.parse(s.finished_at)>start))start+=86400000;
 const sid=randomUUID();await ok('work_operate',{request_id:randomUUID(),operation:'historical',target:sid,expected_revision:null,payload:{order_id:labor.id,order_item_id:labor.items[0].id,user_id:admin.id,started_at:new Date(start).toISOString(),finished_at:new Date(start+3600000).toISOString(),hourly_rate:'7.13',reason:prefix,pauses:[]}});
 c=await cost(labor);check(c.labor_cost==='7.13'&&Number(c.material_cost)===0&&Number(c.expense_cost)===0,'Solo mano de obra');reconcile(c);
 await ok('work_operate',{request_id:randomUUID(),operation:'correct',target:sid,expected_revision:(await row('work_sessions',sid)).revision,payload:{finished_at:new Date(start+1800000).toISOString(),reason:prefix}});check((await cost(labor)).labor_cost==='3.57','Corrección de sesión HALF UP');
 await ok('work_operate',{request_id:randomUUID(),operation:'correct',target:sid,expected_revision:(await row('work_sessions',sid)).revision,payload:{order_id:mixed.id,order_item_id:null,reason:prefix}});check(Number((await cost(labor)).labor_cost)===0&&(await cost(mixed)).labor_cost==='3.57','Atribución de sesión vigente, compartida');
 const expenseId=await expense(exp,'2.01');c=await cost(exp);check(c.expense_cost==='2.01'&&Number(c.material_cost)===0&&Number(c.labor_cost)===0,'Solo gastos');reconcile(c);
 await ok('void_expense',{target:expenseId,expected_revision:(await row('expenses',expenseId)).revision,reason:prefix});check(Number((await cost(exp)).expense_cost)===0,'Gasto anulado excluido');
 await expense(mixed,'1.01');await expense(zero,'1.05');c=await cost(mixed);check(c.material_cost==='0.33'&&c.labor_cost==='3.57'&&c.expense_cost==='1.01','Tres fuentes combinadas');check(c.profit==='-4.89'&&c.margin_percent==='-24450.00','Margen negativo, descuento general y múltiples líneas');reconcile(c);c=await cost(zero);check(c.margin_percent===null&&c.profit==='-1.05'&&c.unallocated_order_cost==='1.05','Total cero conserva costo no asignado');reconcile(c);
 for(const o of [mixed,exp])await state(o,'ready');const ship=randomUUID();await ok('shipment_operate',{request_id:randomUUID(),operation:'create',target:ship,expected_revision:null,payload:{order_id:mixed.id,delivery_type:'pickup'}});const shipExpense=await expense(mixed,'2.03');await ok('shipment_operate',{request_id:randomUUID(),operation:'link',target:ship,expected_revision:1,payload:{expense_id:shipExpense,reason:prefix}});await ok('shipment_operate',{request_id:randomUUID(),operation:'finance',target:ship,expected_revision:2,payload:{paid_by:'business',cost_crc:'2.03',reason:prefix}});check((await cost(mixed)).expense_cost==='3.04','Envío no duplica gasto');
 await state(mixed,'delivered');check((await cost(mixed)).state==='realized','Delivered realizado');await expense(mixed,'1.00');check((await cost(mixed)).expense_cost==='4.04','Gasto posterior actualiza resultado realizado');
 await state(exp,'cancelled');c=await cost(exp);check(c.state==='cancelled'&&c.revenue===null&&c.profit===null&&c.lines.every(l=>l.revenue===null),'Cancelado sin venta inventada');
 for(const o of [materials,labor,mixed,zero,q])reconcile(await cost(o));
 for(const o of [mixed,zero]){const denied=await member.client.rpc('order_costing',{target:o.id});check(denied.error?.code==='42501'&&!denied.data,'Colaborador sin RPC financiera');}
 const anon=await h.anon.rpc('order_costing',{target:mixed.id});check(anon.error?.code==='42501','Anónimo rechazado');
 const readonlyBefore=await row('orders',mixed.id);await cost(mixed);check(JSON.stringify(await row('orders',mixed.id))===JSON.stringify(readonlyBefore),'Consulta no modifica pedido');
 const acquisition=await expense(mixed,'10.00');await ok('link_inventory_expense',{target:receipt,expense:acquisition});check((await cost(mixed)).expense_cost==='4.04','Compra vinculada excluida, solo consumo reconocido');
 await ok('work_operate',{request_id:randomUUID(),operation:'correct',target:sid,expected_revision:(await row('work_sessions',sid)).revision,payload:{finished_at:new Date(start+900000).toISOString(),reason:prefix}});check((await cost(mixed)).labor_cost==='1.78'&&(await cost(mixed)).state==='realized','Corrección laboral posterior mantiene resultado realizado actualizado');
 const fresh={id:randomUUID(),product_id:product,quantity:'2',unit_price:'10',discount_amount:'1',is_active:true};
 await ok('amend_order',{target:q.id,expected_revision:await revision(q.id),payload:{client_id:client,order_date:'1990-01-01',requested_delivery_date:'1990-02-01',discount_amount:'0',items:[...q.items,fresh],reason:prefix}});
 check((await row('order_items',fresh.id)).estimated_minutes_snapshot===99,'Nueva línea confirmada captura estimación vigente');check((await row('order_items',q.items[0].id)).estimated_minutes_snapshot===12,'Edición no recaptura líneas existentes');
 c=await cost(q);check(c.lines.find(l=>l.id===fresh.id).estimated_minutes==='198','Estimación total por cantidad vigente');check(c.revenue==='29.00','Descuento propio de línea contado una vez');reconcile(c);
 const audits=await admin.client.from('audit_log').select('id').eq('entity_id',fresh.id).eq('action','order_item.estimate_captured');check(!audits.error&&audits.data.length===1,'Nueva captura auditada una vez');
 const dml=await admin.client.from('order_items').update({estimated_minutes_snapshot:1000}).eq('id',fresh.id);check(dml.error?.code==='42501','DML directo de snapshot rechazado');
 const legacy=await admin.client.from('order_items').select('id,order_id,estimate_captured_at').is('estimate_captured_at',null).limit(1);assert.equal(legacy.error,null);check(legacy.data.length===1,'Historia previa sin backfill');
 if(legacy.data.length){const lc=await ok('order_costing',{target:legacy.data[0].order_id});check(lc.lines.find(l=>l.id===legacy.data[0].id).estimated_minutes===null,'Estimación histórica previa no inventada');}
 reconcile(await cost(mixed));
 const precision=await quote(Array(7).fill('1'));await confirm(precision);await state(precision,'in_production');
 await ok('work_operate',{request_id:randomUUID(),operation:'historical',target:randomUUID(),expected_revision:null,payload:{order_id:precision.id,user_id:admin.id,started_at:new Date(start+3600000).toISOString(),finished_at:new Date(start+3660000).toISOString(),hourly_rate:'0.90',reason:prefix,pauses:[]}});
 c=await cost(precision);check(c.labor_cost==='0.02'&&c.unallocated_order_cost==='0.00','DEV reparto exacto .015 entre siete líneas');reconcile(c);
 await writeFile('test-results/phase5-real.json',JSON.stringify({environment:'SIGCA DEV JWT real',evidence,ids},null,2));
}finally{await h.close();}
