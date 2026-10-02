// DEV real autorizado. Registros de prueba identificados y conservados, nunca borrados.
import {devHarness} from './support/real-session.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const h=await devHarness(),evidence=[],ids={materials:[],receipts:[]};let admin,admin2,member,restore=false;
const prefix='VALIDACION-4A-'+Date.now();
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
async function material(){const r=await admin.client.rpc('save_material',{target_id:null,material_code:prefix+'-'+ids.materials.length,material_name:prefix,material_category:'Prueba 4A conservada',material_unit:'gramos',minimum:'10',enabled:true,cost:null,cost_currency:'CRC'});ok(!r.error,'Material de prueba con costo catálogo pendiente');ids.materials.push(r.data);return r.data;}
const line=(id,q='3',amount='10',extra={})=>({material_id:id,unit:'gramos',quantity:q,amount,currency:'CRC',...extra});
const payload=(lines,extra={})=>({kind:'purchase',source_reference:prefix,lines,...extra});
async function register(client,lines,revs,extra={},id=randomUUID()){const r=await client.rpc('register_inventory_receipt',{target:id,payload:payload(lines,extra),expected_revisions:revs});if(!r.error)ids.receipts.push(id);return {...r,id};}
async function row(table,id,key='material_id'){const r=await admin.client.from(table).select('*').eq(key,id).single();if(r.error)throw Error('No se pudo leer '+table);return r.data;}
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=await material(),b=await material(),c=await material(),d=await material(),usd=await material();
 let r=await register(admin.client,[line(a)],{[a]:'0'});ok(!r.error,'Primera entrada real CRC');ids.first=r.id;
 let v=await row('inventory_valuations_read',a);ok(v.value_crc==='10'&&v.average_unit_cost_crc==='3.33333333','Promedio periódico y valor interno autoritativo');
 const firstMovement=await admin.client.from('inventory_movements').select('id').eq('material_id',a).single();const cost=await row('inventory_movement_costs_read',firstMovement.data.id,'movement_id');ok(cost.rounding_delta_crc==='0.00000001','Residuo exacto de entrada real');
 r=await register(admin.client,[line(a,'3','11')],{[a]:'1'});ok(!r.error,'Segunda entrada');v=await row('inventory_valuations_read',a);ok(v.value_crc==='21'&&v.average_unit_cost_crc==='3.50000000','Promedio conserva valor, no reconstruye cantidad por promedio');
 let race=await Promise.all([register(admin.client,[line(a,'1','2')],{[a]:'2'}),register(admin2.client,[line(a,'1','5')],{[a]:'2'})]);ok(race.filter(x=>!x.error).length===1&&race.filter(x=>x.status===409).length===1,'Dos entradas simultáneas: éxito y conflicto explícito');
 let balance=await row('inventory_balances',a);ok(balance.revision===3&&String(balance.quantity_on_hand)==='7','Concurrencia sin actualización perdida');
 r=await register(admin.client,[line(a)],{[a]:'0'});ok(r.status===409,'Revisión obsoleta rechazada');
 r=await register(admin.client,[line(a)],{[a]:'3'},{},ids.first);ok(r.status===409,'UUID reenviado no duplica recepción');
 const before=(await admin.client.from('inventory_receipts').select('id',{count:'exact',head:true})).count;
 r=await register(admin.client,[line(b),line(c,'0')],{[b]:'0',[c]:'0'});ok(Boolean(r.error),'Línea inválida provoca rollback');
 const after=(await admin.client.from('inventory_receipts').select('id',{count:'exact',head:true})).count;ok(before===after&&(await admin.client.from('inventory_balances').select('material_id').eq('material_id',b)).data.length===0,'Rollback sin cabecera ni proyección parcial');
 race=await Promise.all([register(admin.client,[line(b),line(c)],{[b]:'0',[c]:'0'}),register(admin2.client,[line(c),line(b)],{[b]:'0',[c]:'0'})]);ok(race.filter(x=>!x.error).length===1&&race.filter(x=>x.status===409).length===1,'Multimaterial en orden inverso: bloqueo determinístico sin deadlock');
 race=await Promise.all([register(admin.client,[line(d)],{[d]:'0'},{kind:'opening_balance',reason:prefix}),register(admin2.client,[line(d)],{[d]:'0'},{kind:'opening_balance',reason:prefix})]);ok(race.filter(x=>!x.error).length===1&&race.filter(x=>x.status===409).length===1,'Saldo inicial simultáneo: solo uno persiste');
 r=await register(admin.client,[line(d)],{[d]:'1'},{kind:'opening_balance',reason:prefix});ok(r.status===409,'Segundo saldo inicial rechazado');
 for(const [q,amount] of [['0','1'],['-1','1'],['1.00001','1'],['1','0'],['1','-1'],['1','1.001'],['100000000','0.01']]){r=await register(admin.client,[line(a,q,amount)],{[a]:'3'});ok(Boolean(r.error),'Validación real cantidad/importe '+q+'/'+amount);}
 r=await admin.client.from('materials').update({unit:'metros'}).eq('id',a);ok(r.error?.code==='22023','Unidad congelada en DML directo');
 r=await admin.client.from('materials').update({is_active:false}).eq('id',c);ok(!r.error,'Inactivación material conserva historia');r=await register(admin.client,[line(c)],{[c]:'1'});ok(Boolean(r.error),'Entrada en material inactivo rechazada');
 r=await register(admin.client,[line(usd,'2','1.25',{currency:'USD',historical_rate:'501.2345',rate_source:prefix+' referencia histórica declarada',rate_reason:'Prueba histórica explícita conservada'})],{[usd]:'0'},{effective_at:'1901-01-01T12:00:00-06:00'});ok(!r.error,'USD histórico Admin con procedencia motivada');
 const snapshot=(await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',r.id)).data[0];ok(snapshot.amount_crc==='626.54'&&snapshot.rate_origin==='admin_historical','Snapshot histórico y equivalente HALF UP real');
 r=await register(admin.client,[line(usd,'1','1',{currency:'USD'})],{[usd]:'1'},{effective_at:'1901-01-02T12:00:00-06:00'});ok(Boolean(r.error),'Histórico sin tasa exacta bloqueado');
 const current=await admin.client.rpc('expense_rate',{day:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});
 if(current.data){r=await register(admin.client,[line(usd,'1','1',{currency:'USD'})],{[usd]:'1'});ok(!r.error,'USD actual con referencia persistida válida');const saved=(await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',r.id)).data[0];ok(saved.exchange_rate_date===current.data.date&&saved.rate_is_fallback===current.data.fallback,'Fecha real e indicador de fallback conservados');}
 const category=randomUUID(),expense=randomUUID();ids.expense=expense;
 r=await admin.client.rpc('save_expense_category',{target:category,expected_revision:0,payload:{name:prefix,is_active:true}});ok(!r.error,'Regresión 3D: categoría');
 r=await admin.client.rpc('register_expense',{target:expense,payload:{category_id:category,amount:'1.00',currency:'CRC',description:prefix}});ok(!r.error,'Regresión 3D: gasto');
 race=await Promise.all([register(admin.client,[line(a,'1','1')],{[a]:'3'},{expense_id:expense}),admin2.client.rpc('edit_expense_notes',{target:expense,expected_revision:1,payload:{description:prefix+' corregido',notes:'Cambio concurrente autorizado'}})]);ok(race.every(x=>!x.error),'Gasto actualizado concurrentemente sin alterar entrada');ids.linked=race[0].id;
 const linkedItems=await admin.client.from('inventory_receipt_items_read').select('*').eq('receipt_id',ids.linked);ok(linkedItems.data[0].amount_crc==='1','Importe inventario independiente del gasto');
 const stockBefore=(await row('inventory_balances',a)).quantity_on_hand;
 r=await admin.client.rpc('void_expense',{target:expense,expected_revision:2,reason:'Prueba 4A: sin reversión automática de inventario'});ok(!r.error,'Regresión 3D: anulación explícita');ok((await row('inventory_balances',a)).quantity_on_hand===stockBefore,'Anular gasto conserva stock y vínculo');
 r=await register(admin.client,[line(a)],{[a]:'4'},{expense_id:randomUUID()});ok(Boolean(r.error),'UUID de gasto inexistente rechazado');
 for(const table of ['inventory_receipts','inventory_receipt_items','inventory_receipt_expenses','inventory_movement_costs','inventory_valuations']){r=await member.client.from(table).select('*');ok(!r.error&&r.data.length===0,'Colaborador sin datos financieros: '+table);}
 r=await member.client.from('inventory_movements_read').select('*').eq('material_id',a);ok(r.data.length>0&&r.data.every(x=>!Object.keys(x).some(k=>/cost|amount|rate|value/.test(k))),'Historial operativo sin campos financieros');
 r=await register(member.client,[line(a)],{[a]:'4'});ok(r.status===403,'Colaborador no registra entradas');
 for(const client of [admin.client,member.client,h.anon]){r=await client.from('inventory_balances').update({quantity_on_hand:'999'}).eq('material_id',a);ok(Boolean(r.error),'DML directo bloqueado');}
 r=await h.anon.from('inventory_stock_read').select('*');ok(Boolean(r.error),'Anónimo sin lectura');
 r=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);ok(!r.error,'Perfil de prueba desactivado explícitamente');restore=true;
 r=await member.client.from('inventory_stock_read').select('*');ok(!r.error&&r.data.length===0,'JWT previo inactivo sin existencias');r=await register(member.client,[line(a)],{[a]:'4'});ok(r.status===403,'JWT previo inactivo sin RPC');
 r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);ok(!r.error,'Perfil de prueba restaurado');restore=false;
 const audit=await admin.client.from('audit_log').select('action,metadata').eq('entity_id',ids.first);ok(audit.data.some(a=>a.action==='inventory.inventory_receipts.registered'&&a.metadata.after.id===ids.first),'Auditoría real atribuida y persistida');
 console.log('TOTAL PASS '+evidence.length);
}finally{
 if(restore&&admin&&member)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4a-real.json',JSON.stringify({environment:'Supabase DEV real',prefix,ids,evidence},null,2));await h.close();
}
