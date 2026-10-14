import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';

// Additional final-audit cases. JWT clients only; no service-role DML.
const h=await devHarness(),evidence=[],matrix=[],owned=[];
let admin,member,oldRate,restore=false,active=true;
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member2=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const one=async(table,id,key='id')=>ok(admin.client.from(table).select('*').eq(key,id).single());
 check((await ok(admin.client.from('work_sessions').select('id').neq('status','finished'))).length===0,'No sesiones abiertas previas');
 oldRate=(await ok(admin.client.from('settings').select('hourly_rate').single())).hourly_rate;assert.equal(oldRate,null);restore=true;
 const setRate=v=>admin.client.from('settings').update({hourly_rate:v}).eq('singleton',true);
 for(const v of ['0','-1','1.001'])check(Boolean((await setRate(v)).error),'Tarifa configuración rechazada '+v);
 await ok(setRate('731.29'));
 const prefix='AUDITORIA-4C-'+Date.now(),customer=(await ok(admin.client.from('clients').insert({name:prefix}).select('id').single())).id;
 async function order(){const id=randomUUID(),line=randomUUID();await ok(admin.client.rpc('save_quote',{target:id,expected_revision:0,payload:{client_id:customer,order_date:'2025-01-01',requested_delivery_date:'2026-12-31',discount_amount:'0',notes:prefix,items:[{id:line,product_name_snapshot:prefix,quantity:'1',unit_price:'1',discount_amount:'0',is_active:true}]}}));await ok(admin.client.rpc('confirm_order',{target:id,expected_revision:1,payload:{confirmed_at:'2025-01-01T12:00:00Z',deposit_percentage:'0'}}));await ok(admin.client.rpc('transition_order',{target:id,expected_revision:2,payload:{state:'in_production'}}));return {id,line};}
 const a=await order(),b=await order();
 const args=async(op,id,payload={})=>({request_id:randomUUID(),operation:op,target:id,expected_revision:['start','historical'].includes(op)?null:(await one('work_sessions',id)).revision,payload});
 const call=(u,p)=>u.client.rpc('work_operate',p);
 const op=async(u,kind,id,p={})=>ok(call(u,await args(kind,id,p)));
 async function start(u=member,o=a){const id=randomUUID();owned.push(id);await op(u,'start',id,{order_id:o.id});return id;}
 async function finish(id){const s=await one('work_sessions',id);if(s.status!=='finished')await op(admin,'finish',id,s.user_id===admin.id?{}:{reason:prefix});}
 async function transition(o,state){const r=await one('orders',o.id);return admin2.client.rpc('transition_order',{target:o.id,expected_revision:r.revision,payload:{state,reason:prefix}});}
 async function replay(u,u2,p,label){
  const first=await Promise.all([call(u,p),call(u2,p)]);check(first.every(r=>!r.error&&r.data===p.target),label+' UUID simultáneo');
  const snapshot=await one('work_sessions',p.target);check((await call(u,p)).data===p.target,label+' UUID secuencial');
  check(JSON.stringify(await one('work_sessions',p.target))===JSON.stringify(snapshot),label+' sin segundo efecto');
  const changed={...p,payload:{...p.payload,...(['start','historical','correct'].includes(p.operation)?{activity:'distinta'}:{reason:'distinto'})}};
  check((await call(u,changed)).error?.code==='PT409',label+' UUID datos distintos conflicto');
  const req=await ok(admin.client.from('work_session_requests').select('id').eq('id',p.request_id));check(req.length===1,label+' una solicitud');
 }
 const sid=randomUUID();owned.push(sid);await replay(member,member2,await args('start',sid,{order_id:a.id}),'Play');
 await replay(member,member2,await args('pause',sid),'Pausa');
 check((await call(member,await args('start',randomUUID(),{order_id:b.id}))).error?.code==='PT409','Play mientras paused rechazado');
 await replay(member,member2,await args('resume',sid),'Reanudar');
 await replay(member,member2,await args('finish',sid),'Finalizar');
 const rate=await one('work_session_rates_read',sid,'work_session_id');await ok(setRate('852.63'));
 check(JSON.stringify(await one('work_session_rates_read',sid,'work_session_id'))===JSON.stringify(rate),'Cambio configuración no altera terminada');
 const other=await start();await replay(admin,admin2,await args('pause',other,{reason:prefix}),'Admin pausa ajena');await replay(admin,admin2,await args('finish',other,{reason:prefix}),'Admin finaliza ajena');
 // Select an empty worker interval from existing history, without deleting fixtures.
 const existing=await ok(admin.client.from('work_sessions').select('started_at,finished_at').eq('user_id',member.id).order('started_at').limit(1000));
 let t=Date.UTC(2025,5,1);const span=3*86400000;
 while(existing.some(s=>Date.parse(s.started_at)<t+span&&Date.parse(s.finished_at)>t))t+=span;
 assert.ok(t+span<Date.now());
 const historical={order_id:a.id,user_id:member.id,started_at:new Date(t).toISOString(),finished_at:new Date(t+span).toISOString(),hourly_rate:'111.19',reason:prefix,pauses:[{paused_at:new Date(t).toISOString(),resumed_at:new Date(t+1000).toISOString()},{paused_at:new Date(t+span-1000).toISOString(),resumed_at:new Date(t+span).toISOString()}]};
 const hist=randomUUID();await replay(admin,admin2,await args('historical',hist,historical),'Histórico');
 check(Number((await one('work_sessions',hist)).worked_seconds)===259198,'Sesión larga y pausas exactas en inicio/fin');
 await replay(admin,admin2,await args('correct',hist,{activity:prefix,reason:prefix}),'Corrección');
 for(const value of [undefined,'0','-1','1.001','bad']){
  const p={...historical,started_at:new Date(t+span+1000).toISOString(),finished_at:new Date(t+span+2000).toISOString(),hourly_rate:value};if(value===undefined)delete p.hourly_rate;
  check((await call(admin,await args('historical',randomUUID(),p))).error?.code==='22023','Histórico tarifa rechazada '+String(value));
 }
 await ok(transition(b,'ready'));
 const readyHist=randomUUID();await op(admin,'historical',readyHist,{...historical,order_id:b.id,started_at:new Date(t+span+1000).toISOString(),finished_at:new Date(t+span+1800).toISOString(),pauses:[]});check((await one('work_sessions',readyHist)).worked_seconds===0,'Histórico Ready menor a segundo');
 // Correction of start/finish independently; touching intervals are legal [start,end).
 await op(admin,'correct',hist,{started_at:new Date(t+1).toISOString(),pauses:[],reason:prefix});
 check(Number((await one('work_sessions',hist)).worked_seconds)===259199,'Corrección inicio recalcula FLOOR');
 await op(admin,'correct',hist,{finished_at:new Date(t+span+1000).toISOString(),reason:prefix});
 check((await call(admin,await args('correct',hist,{finished_at:new Date(t+span+1500).toISOString(),reason:prefix}))).error?.code==='PT409','Corrección con solapamiento rechazada');
 const current=await one('work_sessions',hist);
 check((await call(admin,await args('correct',hist,{order_id:b.id,order_item_id:a.line,reason:prefix}))).error?.code==='22023','Corrección línea de otro pedido rechazada');
 check(JSON.stringify(await one('work_sessions',hist))===JSON.stringify(current),'Corrección fallida no altera sesión');
 for(const change of [{user_id:admin.id},{hourly_rate:'999.99'}])check((await call(admin,await args('correct',hist,{...change,reason:prefix}))).error?.code==='22023','Identidad/tarifa no corregibles');
 // Real races with independent authenticated clients.
 for(const action of ['resume','finish'])for(const state of ['ready','confirmed','cancelled']){
  const o=await order(),id=await start(member,o);await op(member,'pause',id);
  const p=await args(action,id),results=await Promise.all([call(member,p),transition(o,state)]);
  check(!results[0].error&&(!results[1].error||results[1].error.code==='PT409'),action+'/transición '+state+' contrato sin deadlock');
  const s=await one('work_sessions',id),ord=await one('orders',o.id);
  check(action==='resume'?s.status==='running'&&ord.production_status==='in_production':s.status==='finished',action+'/transición '+state+' estado coherente');
  await finish(id);if(ord.production_status==='in_production')await ok(transition(o,state));
  check((await call(member,await args('resume',id))).error?.code==='PT409','Reanudar tras transición rechazada '+state);
 }
 const inactiveId=await start();const before=await one('work_sessions',inactiveId);
 const race=await Promise.all([call(member,await args('pause',inactiveId)),admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id)]);active=false;
 check(!race[1].error&&(!race[0].error||race[0].error.code==='42501'),'Inactivación/acción serializadas sin deadlock');
 for(const action of ['pause','resume','finish'])check((await call(member,await args(action,inactiveId))).error?.code==='42501','JWT inactivo '+action+' rechazado');
 const objects=['work_sessions','work_pauses','work_session_rates','work_session_requests','work_session_rates_read'];
 for(const [role,u] of [['Admin',admin.client],['Inactivo',member.client],['Anónimo',h.anon]])for(const table of objects){
  const read=await u.from(table).select('*').limit(5);check(role==='Admin'?!read.error:role==='Inactivo'?!read.error&&read.data.length===0:read.error?.code==='42501',role+' SELECT '+table);
  const key=table.includes('rates')?'work_session_id':'id';const dml=[];
  for(const kind of ['insert','update','delete']){let q=u.from(table);q=kind==='insert'?q.insert({}):kind==='update'?q.update({[key]:randomUUID()}).eq(key,randomUUID()):q.delete().eq(key,randomUUID());const r=await q;check(r.error?.code==='42501',role+' '+kind+' '+table);dml.push(kind);}
  matrix.push({table,role,select:role==='Admin'?'allowed':'none',dml:'denied',tested:dml});
 }
 await finish(inactiveId);check((await one('work_sessions',inactiveId)).started_at===before.started_at,'Admin finaliza inactivo sin perder inicio/historia');
 await ok(admin.client.from('profiles').update({status:'active'}).eq('id',member.id));active=true;
 for(const table of objects){const r=await member.client.from(table).select('*').limit(1000);check(!r.error&&(table.includes('rates')?r.data.length===0:true),'Colaborador SELECT '+table);const key=table.includes('rates')?'work_session_id':'id';for(const kind of ['insert','update','delete']){const q=member.client.from(table),v=await(kind==='insert'?q.insert({}):kind==='update'?q.update({[key]:randomUUID()}).eq(key,randomUUID()):q.delete().eq(key,randomUUID()));check(v.error?.code==='42501','Colaborador '+kind+' '+table);}matrix.push({table,role:'Colaborador',select:table.includes('rates')?'none':table==='work_session_requests'?'own':'operational',dml:'denied'});}
 const adminSession=await start(admin);await finish(adminSession);
 const read=await ok(member.client.rpc('work_read',{target_order:a.id}));check(read.sessions.some(s=>s.user_id!==member.id&&s.worker_name),'Historial operativo de otro trabajador');
 check(!/hourly_rate|cost|731\.29|852\.63/.test(JSON.stringify(read)),'RPC JSON sin tarifa/costo');
 const financialSettings=await member.client.from('settings').select('hourly_rate');check(Boolean(financialSettings.error)||financialSettings.data.length===0,'Configuración financiera no consultable');
 const audit=await member.client.from('audit_log').select('id');check(Boolean(audit.error)||audit.data.length===0,'Colaborador sin auditoría');
 const events=await ok(admin.client.from('audit_log').select('action,metadata,reason,user_id,created_at').eq('entity_type','work_sessions').in('entity_id',[sid,other,hist]));
 for(const action of ['start','pause','resume','finish','admin_finished','historical','correct'])check(events.some(e=>e.action==='work_session.'+action),'Evento '+action);
 check(events.filter(e=>e.action==='work_session.correct').every(e=>e.reason&&e.user_id===admin.id&&e.created_at&&e.metadata.before.session&&e.metadata.after.session&&Array.isArray(e.metadata.before.pauses)&&Array.isArray(e.metadata.after.pauses)),'Corrección auditoría íntegra');
 const open=await start();check((await call(admin,await args('correct',open,{activity:'no',reason:prefix}))).error?.code==='PT409','Corrección de running rechazada');await finish(open);
 check((await ok(admin.client.from('work_sessions').select('id').neq('status','finished'))).length===0,'Sin sesiones abiertas al terminar');
}finally{
 if(admin){if(!active)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(restore)await admin.client.from('settings').update({hourly_rate:oldRate}).eq('singleton',true);}
 await writeFile('test-results/phase4c-audit-real.json',JSON.stringify({environment:'Supabase DEV real',evidence,matrix,owned},null,2));await h.close();
}
