import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[];let admin;
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);const member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const saved=JSON.parse(await readFile('test-results/phase4c-real.json','utf8')),ord=saved.ids.orders[0],sid=saved.ids.sessions[2];
 const read=async(table,key,id)=>{const r=await admin.client.from(table).select('*').eq(key,id).single();assert.equal(r.error,null);return r.data;};
 const initial=await read('work_sessions','id',sid),rate=await read('work_session_rates_read','work_session_id',sid);
 async function op(payload,revision){const s=await read('work_sessions','id',sid);return admin.client.rpc('work_operate',{request_id:randomUUID(),operation:'correct',target:sid,expected_revision:revision??s.revision,payload:{reason:'Validación límites 4C',...payload}});}
 const financial={};for(const table of ['payments','manual_income','expenses','inventory_movements','inventory_balances','inventory_valuations']){const r=await admin.client.from(table).select('*').order(table.startsWith('inventory_')&&table!=='inventory_movements'?'material_id':'id');assert.equal(r.error,null);financial[table]=JSON.stringify(r.data);}
 let r=await op({activity:'Cambio explícito 4C'});check(!r.error,'Corrección actividad');
 r=await op({activity:'Revisión antigua'},initial.revision);check(r.error?.code==='PT409','Revisión obsoleta rechazada');
 r=await op({started_at:initial.started_at,finished_at:new Date(Date.parse(initial.finished_at)+100).toISOString()});check(!r.error,'Corrección de tiempo válida');
 r=await op({pauses:[{paused_at:initial.started_at,resumed_at:new Date(Date.parse(initial.started_at)+1000).toISOString()},{paused_at:new Date(Date.parse(initial.started_at)+500).toISOString(),resumed_at:new Date(Date.parse(initial.started_at)+2000).toISOString()}]});check(r.error?.code==='22023','Pausas solapadas rechazadas');
 r=await op({started_at:'2024-01-01T00:00:00Z'});check(r.error?.code==='22023','Inicio anterior a confirmación rechazado');
 r=await op({finished_at:'2099-01-01T00:00:00Z'});check(r.error?.code==='22023','Fecha futura rechazada');
 for(const state of ['delivered','cancelled']){
 const candidate=await admin.client.from('orders').select('id,delivered_at,cancelled_at').eq('production_status',state).like('notes','VALIDACION-4C-%').order('created_at',{ascending:false}).limit(1).single();assert.equal(candidate.error,null);
 const bound=state==='delivered'?candidate.data.delivered_at:candidate.data.cancelled_at;
 r=await op({order_id:candidate.data.id,order_item_id:null,finished_at:new Date(Date.parse(bound)+1).toISOString()});check(r.error?.code==='22023','Fin posterior a '+state+' rechazado');
 }
 r=await op({reason:''});check(r.error?.code==='22023','Motivo vacío rechazado');
 const otherItem=(await admin.client.from('order_items').select('id').eq('order_id',saved.ids.orders[1]).limit(1)).data[0].id;
 r=await op({order_id:ord,order_item_id:otherItem});check(r.error?.code==='22023','Línea ajena rechazada');
 const itemId=randomUUID(),q=randomUUID(),customer=(await read('orders','id',ord)).client_id;
 const rpc=async(name,args)=>{const v=await admin.client.rpc(name,args);assert.equal(v.error,null,JSON.stringify(v.error));return v.data;};
 await rpc('save_quote',{target:q,expected_revision:0,payload:{client_id:customer,order_date:'2025-01-01',requested_delivery_date:'2026-12-01',discount_amount:'0',items:[{id:randomUUID(),product_name_snapshot:'Validación 4C activa',quantity:'1',unit_price:'1',discount_amount:'0',is_active:true},{id:itemId,product_name_snapshot:'Validación 4C histórica inactiva',quantity:'1',unit_price:'1',discount_amount:'0',is_active:false}]}});
 await rpc('confirm_order',{target:q,expected_revision:1,payload:{confirmed_at:'2025-01-01T12:00:00Z',deposit_percentage:'0'}});
 r=await op({order_id:q,order_item_id:itemId});check(!r.error,'Corrección atribución a línea histórica inactiva');
 const corrected=await read('work_sessions','id',sid);check(corrected.user_id===initial.user_id,'Trabajador permanece inmutable');check(JSON.stringify(await read('work_session_rates_read','work_session_id',sid))===JSON.stringify(rate),'Tarifa/evidencia inmutables tras todas las correcciones');
 const historicalStart=new Date(Date.UTC(2025,3,1)+(Date.now()%(10*86400000)));const historicId=randomUUID();r=await admin.client.rpc('work_operate',{request_id:randomUUID(),operation:'historical',target:historicId,expected_revision:null,payload:{order_id:q,order_item_id:itemId,user_id:member.id,started_at:historicalStart.toISOString(),finished_at:new Date(historicalStart.getTime()+800).toISOString(),hourly_rate:'999.99',reason:'Prueba histórica de línea inactiva'}});check(!r.error,'Alta histórica línea inactiva');
 const audits=await admin.client.from('audit_log').select('user_id,metadata,reason,created_at').eq('entity_type','work_sessions').eq('entity_id',sid).eq('action','work_session.correct');assert.equal(audits.error,null);check(audits.data.length>=3&&audits.data.every(a=>a.user_id===admin.id&&a.reason&&a.created_at&&a.metadata.before?.session&&a.metadata.after?.session&&Array.isArray(a.metadata.before.pauses)&&Array.isArray(a.metadata.after.pauses)),'Auditoría before/after completa, actor, timestamp y motivo');
 for(const table of ['work_sessions','work_pauses','work_session_rates','work_session_requests']){const key=table==='work_session_rates'?'work_session_id':'id';for(const client of [admin.client,member.client])check((await client.from(table).delete().eq(key,randomUUID())).error?.code==='42501','DELETE directo bloqueado '+table);}
 check((await member.client.from('work_session_rates_read').select('*')).data.length===0,'Vista textual Admin protegida por RLS');
 for(const table of Object.keys(financial)){const r=await admin.client.from(table).select('*').order(table.startsWith('inventory_')&&table!=='inventory_movements'?'material_id':'id');assert.equal(r.error,null);check(JSON.stringify(r.data)===financial[table],'Horas no modifica '+table);}
}finally{await writeFile('test-results/phase4c-boundaries-real.json',JSON.stringify({environment:'Supabase DEV real',evidence},null,2));await h.close();}
