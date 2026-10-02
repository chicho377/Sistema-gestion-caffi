// Fixtures DEV conservados. Ningún cambio de caché cambiaria ni borrado.
import {devHarness} from './support/real-session.mjs';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const h=await devHarness(),evidence=[],prefix='PRECISION-4A-'+Date.now();
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const r=await admin.client.rpc('save_material',{target_id:null,material_code:prefix,material_name:prefix,material_category:'Prueba conservada',material_unit:'gramos',minimum:'200000000',enabled:true,cost:null,cost_currency:'CRC'});ok(!r.error,'Material para empate decimal');
 const material=r.data,receipt=randomUUID();
 const entry=await admin.client.rpc('register_inventory_receipt',{target:receipt,payload:{kind:'purchase',source_reference:prefix,lines:[{material_id:material,unit:'gramos',quantity:'200000000',amount:'1',currency:'CRC'}]},expected_revisions:{[material]:'0'}});ok(!entry.error,'Entrada con costo matemático 0.000000005');
 const item=await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',receipt).single();ok(item.data?.unit_cost_crc==='0.00000001','HALF UP a ocho decimales en RPC DEV');
 const valuation=await admin.client.from('inventory_valuations_read').select('*').eq('material_id',material).single();ok(valuation.data?.value_crc==='1'&&valuation.data.average_unit_cost_crc==='0.00000001','Valor autoritativo distinto de cantidad por promedio redondeado');
 const movement=await admin.client.from('inventory_movements').select('id').eq('material_id',material).single();const cost=await admin.client.from('inventory_movement_costs_read').select('*').eq('movement_id',movement.data.id).single();ok(cost.data?.rounding_delta_crc==='-1.00000000','Residuo negativo explícito sin alterar importe');
 const stock=await member.client.from('inventory_stock_read').select('*').eq('id',material).single();ok(stock.data?.low_stock===true,'Alerta incluye igualdad stock/mínimo');
 const changed=await admin.client.rpc('save_material',{target_id:material,material_code:prefix,material_name:prefix,material_category:'Prueba conservada',material_unit:'gramos',minimum:'200000000',enabled:true,cost:'900',cost_currency:'CRC'});ok(!changed.error,'Cambio autorizado del costo de catálogo');
 const after=await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',receipt).single();ok(JSON.stringify(item.data)===JSON.stringify(after.data),'Costo de catálogo no reescribe snapshot');
 const fixture=JSON.parse(await readFile('test-results/phase4a-real.json','utf8'));
 const before=await admin.client.from('inventory_valuations_read').select('*').eq('material_id',material).single();
 const denied=await member.client.rpc('link_inventory_expense',{target:receipt,expense:fixture.ids.expense});ok(denied.status===403,'Colaborador no vincula gasto');
 const linked=await admin.client.rpc('link_inventory_expense',{target:receipt,expense:fixture.ids.expense});ok(!linked.error,'Vínculo administrativo posterior explícito');
 const retry=await admin.client.rpc('link_inventory_expense',{target:receipt,expense:fixture.ids.expense});ok(retry.status===409,'Vínculo no se sobrescribe');
 const end=await admin.client.from('inventory_valuations_read').select('*').eq('material_id',material).single();ok(JSON.stringify(before.data)===JSON.stringify(end.data),'Vincular gasto no cambia valoración');
 const audit=await admin.client.from('audit_log').select('action,user_id,created_at').eq('entity_id',receipt);ok(audit.data?.some(a=>a.action==='inventory.inventory_receipt_expenses.registered'&&a.user_id===admin.id&&a.created_at),'Auditoría atribuida del vínculo posterior');
 console.log('TOTAL PASS '+evidence.length);
}finally{await writeFile('test-results/phase4a-precision-real.json',JSON.stringify({environment:'Supabase DEV real',prefix,evidence},null,2));await h.close();}
