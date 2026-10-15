import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[],ids={orders:[],sessions:[]};let admin,member,rate,restore=false;
const prefix='VALIDACION-4E-'+Date.now();
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const ok=async(name,args,u=admin)=>{const r=await u.client.rpc(name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const row=async(t,key,id)=>{const r=await admin.client.from(t).select('*').eq(key,id).single();assert.equal(r.error,null);return r.data;};
 const financial=async()=>{const a=[];for(const t of ['payments','manual_income','expenses']){const r=await admin.client.from(t).select('id',{count:'exact',head:true});assert.equal(r.error,null);a.push(r.count);}return JSON.stringify(a);};
 const open=await admin.client.from('work_sessions').select('id').neq('status','finished');assert.equal(open.error,null);assert.equal(open.data.length,0,'No intervenir sesiones abiertas');
 const settings=await admin.client.from('settings').select('hourly_rate').single();assert.equal(settings.error,null);rate=settings.data.hourly_rate;
 assert.equal((await admin.client.from('settings').update({hourly_rate:'456.78'}).eq('singleton',true)).error,null);restore=true;
 const client=await admin.client.from('clients').insert({name:prefix,address:'Dirección integrada original'}).select('id').single();assert.equal(client.error,null);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const type of ['shipping','pickup']){
  const order=randomUUID(),line=randomUUID();ids.orders.push(order);
  await ok('save_quote',{target:order,expected_revision:0,payload:{client_id:client.data.id,order_date:today,requested_delivery_date:today,discount_amount:'0',notes:prefix,items:[{id:line,product_name_snapshot:prefix,quantity:'1',unit_price:'100',discount_amount:'0',is_active:true}]}});
  await ok('confirm_order',{target:order,expected_revision:1,payload:{deposit_percentage:'0'}});await ok('transition_order',{target:order,expected_revision:2,payload:{state:'in_production'}});
  const financeBefore=await financial();const material=await ok('save_material',{target_id:null,material_code:prefix+'-'+type,material_name:prefix,material_category:'Integración',material_unit:'gramos',minimum:'1',enabled:true,cost:null,cost_currency:'CRC'});
  const receipt=randomUUID();await ok('register_inventory_receipt',{target:receipt,expected_revisions:{[material]:'0'},payload:{kind:'purchase',source_reference:prefix,lines:[{material_id:material,unit:'gramos',quantity:'3',amount:'10',currency:'CRC'}]}});
  const receiptBefore=await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',receipt);assert.equal(receiptBefore.error,null);
  const consumption=randomUUID();await ok('inventory_operation',{target:consumption,operation:'consumption',payload:{material_id:material,order_id:order,order_item_id:line,quantity:'1',reason:prefix},expected_revisions:{[material]:'1'},expected_orders:{[order]:3}},member);
  const costBefore=await row('inventory_operation_costs_read','movement_id',consumption);check(costBefore.assigned_value_crc==='3.33333333',type+' consumo con valor histórico');
  const source=await row('inventory_operations_read','id',consumption);await ok('inventory_operation',{target:randomUUID(),operation:'return',payload:{material_id:material,source_movement_id:consumption,attribution_revision:source.attribution_revision,quantity:'1',reason:prefix},expected_revisions:{[material]:'2'},expected_orders:{[order]:3}},member);
  const valuation=await row('inventory_valuations_read','material_id',material);check(valuation.value_crc==='10.00000000'||Number(valuation.value_crc)===10,type+' devolución final recupera valor exacto');check(await financial()===financeBefore,type+' inventario no crea pagos/ingresos/gastos');
  const inventoryBefore=JSON.stringify(await row('inventory_balances','material_id',material));
  const sessions=[{id:randomUUID(),u:admin},{id:randomUUID(),u:member}];ids.sessions.push(...sessions.map(s=>s.id));
  await Promise.all(sessions.map(s=>ok('work_operate',{request_id:randomUUID(),operation:'start',target:s.id,expected_revision:null,payload:{order_id:order,order_item_id:line,activity:prefix}},s.u)));
  check((await admin.client.from('work_sessions').select('id').eq('order_id',order).eq('status','running')).data.length===2,type+' varios trabajadores simultáneos');
  const blocked=await admin.client.rpc('transition_order',{target:order,expected_revision:3,payload:{state:'ready'}});check(blocked.error?.code==='PT409',type+' horas abiertas bloquean ready');
  await ok('work_operate',{request_id:randomUUID(),operation:'pause',target:sessions[1].id,expected_revision:1,payload:{}},member);
  await ok('work_operate',{request_id:randomUUID(),operation:'resume',target:sessions[1].id,expected_revision:2,payload:{}},member);
  for(const s of sessions)await ok('work_operate',{request_id:randomUUID(),operation:'finish',target:s.id,expected_revision:(await row('work_sessions','id',s.id)).revision,payload:{}},s.u);
  check(JSON.stringify(await row('inventory_balances','material_id',material))===inventoryBefore,type+' horas no alteran inventario');check(await financial()===financeBefore,type+' horas no alteran finanzas');
  await ok('transition_order',{target:order,expected_revision:3,payload:{state:'ready'}});
  const shipment=randomUUID();await ok('shipment_operate',{request_id:randomUUID(),operation:'create',target:shipment,expected_revision:null,payload:{order_id:order,delivery_type:type,courier:type==='shipping'?'Mensajería':null}},member);
  const address=(await row('shipments','id',shipment)).delivery_address;await admin.client.from('clients').update({address:'Dirección modificada '+type}).eq('id',client.data.id);check((await row('shipments','id',shipment)).delivery_address===address,type+' snapshot dirección estable');
  const category=randomUUID(),expense=randomUUID();await ok('save_expense_category',{target:category,expected_revision:0,payload:{name:prefix+' '+type,is_active:true}});
  await ok('register_expense',{target:expense,payload:{category_id:category,amount:'17.25',currency:'CRC',description:prefix,order_id:order}});
  const afterExpense=await financial();const expenseBefore=JSON.stringify(await row('expenses','id',expense));
  const ship=async(op,payload={},u=admin)=>ok('shipment_operate',{request_id:randomUUID(),operation:op,target:shipment,expected_revision:(await row('shipments','id',shipment)).revision,payload},u);
  await ship('link',{expense_id:expense,reason:prefix});await ship('finance',{paid_by:'business',cost_crc:'17.25',reason:prefix});
  await ship('advance',{},member);if(type==='shipping')await ship('advance',{},member);await ship('advance',{},member);
  check((await row('orders','id',order)).production_status==='ready',type+' envío no entrega pedido');check(await financial()===afterExpense,type+' shipment no duplica gastos');check(JSON.stringify(await row('expenses','id',expense))===expenseBefore,type+' shipment no modifica gasto');
  await ok('transition_order',{target:order,expected_revision:4,payload:{state:'delivered'}},member);check((await row('orders','id',order)).production_status==='delivered',type+' entrega explícita del pedido');
  check(JSON.stringify(await row('inventory_operation_costs_read','movement_id',consumption))===JSON.stringify(costBefore),type+' snapshot consumo estable');
  const receiptAfter=await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',receipt);check(JSON.stringify(receiptAfter.data)===JSON.stringify(receiptBefore.data),type+' snapshot entrada estable');
  for(const t of ['shipment_finances_read','inventory_valuations_read','work_session_rates_read']){const r=await member.client.from(t).select('*');check(!r.error&&r.data.length===0,type+' costos ocultos '+t);}
  check((await Promise.all(sessions.map(async s=>(await row('work_session_rates_read','work_session_id',s.id)).hourly_rate_applied==='456.78'))).every(Boolean),type+' tarifa histórica preservada');
 }
 await writeFile('test-results/phase4e-real.json',JSON.stringify({environment:'DEV real JWT integrado',evidence,ids},null,2));
}finally{if(restore)assert.equal((await admin.client.from('settings').update({hourly_rate:rate}).eq('singleton',true)).error,null);await h.close();}
