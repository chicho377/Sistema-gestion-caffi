// Auditoría autorizada: JWT ordinarios, fixtures identificados y conservados.
import {devHarness} from './support/real-session.mjs';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const h=await devHarness(),evidence=[],matrix=[],examples=[],ids={materials:[],receipts:[]};let admin,member,inactive=false;
const prefix='AUDITORIA-4A-'+Date.now(),base=process.env.SIGCA_UI_URL??'http://localhost:3001';
const tables=['inventory_receipts','inventory_receipt_items','inventory_receipt_expenses','inventory_movements','inventory_movement_costs','inventory_balances','inventory_valuations'];
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
const scaled=(v,n)=>{const [a,b='']=String(v).split('.');return BigInt(a)*10n**BigInt(n)+BigInt(b.padEnd(n,'0'));};
const round=(a,b)=>(a*2n+b)/(2n*b);
const line=(material_id,quantity='1',amount='1')=>({material_id,unit:'gramos',quantity,amount,currency:'CRC'});
async function material(){const r=await admin.client.rpc('save_material',{target_id:null,material_code:prefix+'-'+ids.materials.length,material_name:prefix,material_category:'Auditoría conservada',material_unit:'gramos',minimum:'10',enabled:true,cost:null,cost_currency:'CRC'});if(r.error)throw Error('Material '+r.error.code);ids.materials.push(r.data);return r.data;}
async function rows(table,key,id){const r=await admin.client.from(table).select('*').eq(key,id);if(r.error)throw Error('Lectura '+table);return r.data;}
async function rev(id){return String((await rows('inventory_balances','material_id',id))[0]?.revision??0);}
async function register(client,lines,revisions,extra={},id=randomUUID()){const r=await client.rpc('register_inventory_receipt',{target:id,payload:{kind:'purchase',source_reference:prefix,lines,...extra},expected_revisions:revisions});if(!r.error)ids.receipts.push(id);return {...r,id};}
async function counts(){const pairs=await Promise.all([...tables,'audit_log','expenses'].map(async t=>{const r=await admin.client.from(t).select('*',{count:'exact',head:true});if(r.error)throw Error('Conteo '+t);return [t,r.count];}));return Object.fromEntries(pairs);}
async function snapshot(id){return {balance:await rows('inventory_balances','material_id',id),valuation:await rows('inventory_valuations_read','material_id',id),items:await rows('inventory_receipt_items_read','material_id',id)};}
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);const admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=await material(),b=await material(),c=await material(),d=await material();
 let q=0n,v=0n;
 for(const [quantity,amount] of [['0.125','10.01'],['2.0001','7.13'],['3','10'],['0.0001','0.01']]){
  const before=await counts();const r=await register(admin.client,[line(a,quantity,amount)],{[a]:await rev(a)});ok(!r.error,'Entrada fraccionaria sucesiva '+quantity+'/'+amount);
  q+=scaled(quantity,4);v+=scaled(amount,2);const value=(await rows('inventory_valuations_read','material_id',a))[0],stock=(await rows('inventory_stock_read','id',a))[0];
  ok(scaled(value.value_crc,2)===v&&scaled(stock.stock,4)===q&&scaled(value.average_unit_cost_crc,8)===round(v*10000000000n,q),'V/Q/A exactos sin float ni reconstrucción desde promedio');
  examples.push({quantity,amount,new_quantity:stock.stock,new_value:value.value_crc,new_average:value.average_unit_cost_crc});const after=await counts();ok(after.expenses===before.expenses&&after.inventory_movements===before.inventory_movements+1,'Residuo no genera gasto ni movimiento adicional');
 }
 // Fallo intermedio: cabecera, primera línea y proyecciones ya fueron intentadas.
 const category=randomUUID(),otherCategory=randomUUID(),expense=randomUUID();
 for(const id of [category,otherCategory]){const r=await admin.client.rpc('save_expense_category',{target:id,expected_revision:0,payload:{name:prefix+' '+id,is_active:true}});if(r.error)throw Error('Categoría');}
 let before=await counts();let r=await admin.client.rpc('register_expense',{target:expense,payload:{category_id:category,amount:'2',currency:'CRC',description:prefix}});ok(!r.error,'Gasto válido explícito');let after=await counts();ok(tables.every(t=>after[t]===before[t]),'Registrar gasto no crea objetos de inventario');
 before=await counts();const projections=await snapshot(a);
 r=await register(admin.client,[line(a),line(b,'0'),line(c)],{[a]:await rev(a),[b]:'0',[c]:'0'},{expense_id:expense});ok(r.error?.code==='22023','Falla forzada en línea intermedia');
 after=await counts();for(const t of [...tables,'audit_log'])ok(after[t]===before[t],'Rollback completo '+t);
 ok(JSON.stringify(await snapshot(a))===JSON.stringify(projections),'Rollback conserva proyección y snapshots previos');
 // Dos transacciones parcialmente solapadas: A/B frente a B/C.
 const av=await rev(a);const race=await Promise.all([register(admin.client,[line(a),line(b)],{[a]:av,[b]:'0'}),register(admin2.client,[line(b),line(c)],{[b]:'0',[c]:'0'})]);
 ok(race.filter(x=>!x.error).length===1&&race.filter(x=>x.status===409).length===1,'Multilínea A/B frente a B/C: un commit y un 409 sin deadlock');
 ok((await rev(b))==='1','Material común actualizado una sola vez');
 const same=randomUUID(),rv=await rev(d);const duplicate=await Promise.all([register(admin.client,[line(d)],{[d]:rv},{},same),register(admin2.client,[line(d)],{[d]:rv},{},same)]);
 ok(duplicate.filter(x=>!x.error).length===1&&duplicate.filter(x=>x.status===409).length===1,'Mismo UUID simultáneo: sin duplicados');
 r=await register(admin.client,[line(d)],{[d]:await rev(d)},{kind:'opening_balance',reason:prefix});ok(r.status===409,'Apertura después de compra rechazada');
 const fresh=await material();r=await register(admin.client,[line(fresh)],{[fresh]:'0'},{kind:'opening_balance'});ok(r.error?.code==='22023','Saldo inicial exige motivo');
 r=await register(member.client,[line(fresh)],{[fresh]:'0'},{kind:'opening_balance',reason:prefix});ok(r.status===403,'Saldo inicial Colaborador rechazado');
 const opening=await register(admin.client,[line(fresh)],{[fresh]:'0'},{kind:'opening_balance',reason:prefix});ok(!opening.error,'Saldo inicial Admin auditado');
 for(const who of [admin,member]){r=await who.client.rpc('save_material',{target_id:a,material_code:prefix+'-0',material_name:prefix,material_category:'Auditoría conservada',material_unit:'metros',minimum:'10',enabled:true,cost:null,cost_currency:'CRC'});ok(r.error?.code==='22023','Unidad congelada por RPC '+(who===admin?'Admin':'Colaborador'));}
 const untouched=await material();r=await member.client.from('materials').update({unit:'metros'}).eq('id',untouched);ok(!r.error&&(await rows('materials','id',untouched))[0].unit==='metros','Material sin movimientos conserva edición operativa de unidad');
 const stock=(await rows('inventory_stock_read','id',a))[0];before=await snapshot(a);
 r=await admin.client.from('materials').update({min_stock:stock.stock}).eq('id',a);ok(!r.error&&(await rows('inventory_stock_read','id',a))[0].low_stock,'Igualdad activa alerta derivada');
 r=await admin.client.from('materials').update({min_stock:'0'}).eq('id',a);ok(!r.error&&!(await rows('inventory_stock_read','id',a))[0].low_stock,'Cambiar mínimo actualiza alerta');ok(JSON.stringify(before)===JSON.stringify(await snapshot(a)),'Cambiar mínimo no altera movimiento/proyecciones');
 r=await admin.client.from('materials').update({is_active:false}).eq('id',a);ok(!r.error,'Inactivar material con historia');r=await register(admin.client,[line(a)],{[a]:await rev(a)});ok(r.error?.code==='22023','Material inactivo rechaza entrada');
 r=await member.client.from('inventory_stock_read').select('*').eq('id',a);ok(r.data?.length===1&&!r.data[0].is_active,'Colaborador conserva consulta de material inactivo');
 r=await admin.client.rpc('link_inventory_expense',{target:opening.id,expense});ok(!r.error,'Vincular gasto válido');before=await snapshot(fresh);
 r=await admin.client.rpc('reclassify_expense',{target:expense,expected_revision:1,new_category:otherCategory,reason:prefix});ok(!r.error,'Reclasificación administrativa del gasto vinculado');ok(JSON.stringify(before)===JSON.stringify(await snapshot(fresh)),'Reclasificar gasto no altera snapshot ni proyección');
 r=await admin.client.rpc('void_expense',{target:expense,expected_revision:2,reason:prefix});ok(!r.error&&JSON.stringify(before)===JSON.stringify(await snapshot(fresh)),'Anular gasto no altera existencia/valoración');
 const movements=await rows('inventory_movements_read','material_id',a);movements.sort((x,y)=>Number(x.material_sequence)-Number(y.material_sequence));let quantity=0n,value=0n;
 for(const [i,m] of movements.entries()){
  const cost=(await rows('inventory_movement_costs_read','movement_id',m.id))[0];ok(!!cost&&BigInt(m.material_sequence)===BigInt(i+1)&&scaled(m.stock_before,4)===quantity,'Secuencia y evidencia privada movimiento '+(i+1));
  quantity+=scaled(m.quantity,4);value+=scaled(cost.movement_amount_crc,2);ok(scaled(m.stock_after,4)===quantity&&scaled(cost.value_after_crc,2)===value,'Reconstrucción movimiento '+(i+1));
 }
 const reconstructed=(await rows('inventory_valuations_read','material_id',a))[0];ok(scaled(reconstructed.value_crc,2)===value,'Valoración reconstruible desde diario completo');
 const openingItem=(await rows('inventory_receipt_items','receipt_id',opening.id))[0],openingMove=(await rows('inventory_movements','receipt_item_id',openingItem.id))[0];
 const known={inventory_receipts:['id',opening.id],inventory_receipt_items:['id',openingItem.id],inventory_receipt_expenses:['receipt_id',opening.id],inventory_movements:['id',openingMove.id],inventory_movement_costs:['movement_id',openingMove.id],inventory_balances:['material_id',fresh],inventory_valuations:['material_id',fresh]};
 for(const [table,[,id]] of Object.entries(known)){
  const logs=await admin.client.from('audit_log').select('*').eq('entity_type',table).eq('entity_id',id);ok(logs.data?.some(e=>e.user_id===admin.id&&e.created_at&&e.metadata.after),'Auditoría actor/fecha/after '+table);
  if(['inventory_balances','inventory_valuations'].includes(table))ok(logs.data.some(e=>e.metadata.before&&e.action.endsWith('.updated')),'Auditoría before/after '+table);
  if(table==='inventory_receipts')ok(logs.data.some(e=>e.reason===prefix&&e.metadata.after.receipt_kind==='opening_balance'),'Motivo de apertura conservado');
 }
 for(const role of ['Admin','Colaborador','Inactivo','Anónimo']){
  if(role==='Inactivo'){r=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(r.error)throw Error('Inactivación');inactive=true;}
  const client=role==='Admin'?admin.client:role==='Anónimo'?h.anon:member.client;
  for(const table of tables){const [key,id]=known[table];const responses=await Promise.all([client.from(table).select('*').eq(key,id),client.from(table).insert({[key]:randomUUID()}),client.from(table).update({[key]:id}).eq(key,id).neq(key,id),client.from(table).delete().eq(key,id).neq(key,id)]);
   const readable=role==='Admin'||(role==='Colaborador'&&['inventory_movements','inventory_balances'].includes(table));ok(readable?!responses[0].error&&responses[0].data.length===1:!!responses[0].error||responses[0].data.length===0,role+' SELECT UUID conocido '+table);
   for(let i=1;i<4;i++)ok(responses[i].error?.code==='42501',role+' '+['','INSERT','UPDATE','DELETE'][i]+' bloqueado '+table);
   const op=table==='inventory_receipt_expenses'?'link_inventory_expense':'register_inventory_receipt';const result=await client.rpc(op,op==='link_inventory_expense'?{target:randomUUID(),expense}:{target:randomUUID(),payload:{},expected_revisions:{}});ok(result.error?.code===(role==='Admin'?'22023':'42501'),role+' RPC '+table);
   matrix.push({table,role,SELECT:readable?'fila autorizada':'sin acceso/filas',INSERT:responses[1].error.code,UPDATE:responses[2].error.code,DELETE:responses[3].error.code,RPC:role==='Admin'?'autorizada, payload inválido rechazado':'42501'});
  }
  const priv=await client.schema('private').from('inventory_balances').select('*');ok(priv.error?.code==='PGRST106','private no expuesto '+role);
 }
 r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(r.error)throw Error('Restauración');inactive=false;
 r=await member.client.from('audit_log').select('*').eq('entity_id',opening.id);ok(!r.data?.length,'Colaborador sin auditoría general');
 // JOIN conocido no expone evidencia privada aunque el movimiento sea visible.
 r=await member.client.from('inventory_movements').select('id,inventory_movement_costs(*)').eq('id',openingMove.id);ok(!r.error&&r.data.length===1&&(!r.data[0].inventory_movement_costs||Object.keys(r.data[0].inventory_movement_costs).length===0),'JOIN operacional no fuga costo conocido');
 for(const [table,bucket,route] of [['product_images','catalog-images','catalog-image'],['order_files','order-references','order-file'],['expense_files','expense-receipts','expense-file']]){
  const record=(await admin.client.from(table).select('id,path,is_active').limit(1)).data?.[0];if(!record)throw Error('Falta fixture Storage '+table);
  const response=await admin.context.request.get(base+'/api/'+route+'/'+record.id);ok(response.status()===(table==='product_images'&&!record.is_active?404:200)&&response.headers()['cache-control']==='private, no-store','Storage Admin proxy segun estado vigente '+bucket);
  ok(!!(await member.client.storage.from(bucket).download(record.path)).error,'Storage SDK bloqueado '+bucket);
  ok((await fetch(base+'/api/'+route+'/'+record.id)).status===401,'Storage proxy anónimo bloqueado '+bucket);
  ok(!(await fetch(h.anon.storage.from(bucket).getPublicUrl(record.path).data.publicUrl)).ok,'Bucket privado '+bucket);
 }
 console.log('TOTAL PASS '+evidence.length);
}finally{
 if(inactive){const r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(r.error)throw Error('Debe restaurarse perfil de prueba');}
 await writeFile('test-results/phase4a-audit-real.json',JSON.stringify({environment:'Supabase DEV real',prefix,evidence,matrix,examples,ids},null,2));await h.close();
}
