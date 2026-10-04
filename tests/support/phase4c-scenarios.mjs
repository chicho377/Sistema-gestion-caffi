import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function workScenarios(h){
 const evidence=[],prefix='VALIDACION-4C-'+Date.now(),ids={orders:[],sessions:[]};
 const check=(v,label)=>{assert.ok(v,label);evidence.push(label);};
 const call=(who,name,args)=>h.rpc(who,name,args);
 const ok=async(name,args,who='admin')=>{const r=await call(who,name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const row=async(table,key,id)=>(await h.rows('admin',table,key,id))[0];
 const rev=async id=>(await row('work_sessions','id',id)).revision;
 const orev=async id=>(await row('orders','id',id)).revision;
 const customer=await h.client(prefix);
 const histTime=(offset)=>new Date(Date.UTC(2025,1,1)+(Date.now() % (20*86400000))+offset).toISOString();
 const anchor=histTime(0);const ht=offset=>new Date(Date.parse(anchor)+offset).toISOString();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 async function order(){const id=randomUUID(),line=randomUUID();await ok('save_quote',{target:id,expected_revision:0,payload:{client_id:customer,order_date:'2025-01-01',requested_delivery_date:today,discount_amount:'0',notes:prefix,items:[{id:line,product_name_snapshot:prefix,quantity:'1',unit_price:'1',discount_amount:'0',is_active:true}]}});await ok('confirm_order',{target:id,expected_revision:1,payload:{confirmed_at:'2025-01-01T12:00:00Z',deposit_percentage:'0'}});await ok('transition_order',{target:id,expected_revision:2,payload:{state:'in_production'}});ids.orders.push(id);return {id,line};}
 async function args(operation,target,payload={}){return {request_id:randomUUID(),operation,target,expected_revision:['start','historical'].includes(operation)?null:await rev(target),payload};}
 const operate=async(op,id,p={},who='admin')=>ok('work_operate',await args(op,id,p),who);
 const deny=async(op,id,p={},who='admin',code)=>{const r=await call(who,'work_operate',await args(op,id,p));check(Boolean(r.error)&&(!code||r.error.code===code),'Rechazo '+op+' '+who+' '+evidence.length);};
 const a=await order(),b=await order();
 await h.rate(null);await deny('start',randomUUID(),{order_id:a.id});check((await h.setRate('0')).error!=null,'Tarifa cero rechazada');check((await h.setRate('1.001')).error!=null,'Tarifa con tres decimales rechazada');await h.rate('1234.56');
 const sid=randomUUID();ids.sessions.push(sid);const start=await args('start',sid,{order_id:a.id,order_item_id:a.line,activity:prefix});await ok('work_operate',start,'member');
 check((await row('work_sessions','id',sid)).status==='running','Play normal');check(String((await row('work_session_rates','work_session_id',sid)).hourly_rate_applied)==='1234.56','Snapshot tarifa');
 await h.rate('2345.67');check(String((await row('work_session_rates','work_session_id',sid)).hourly_rate_applied)==='1234.56','Cambio tarifa no altera abierta');
 check(await ok('work_operate',start,'member')===sid,'UUID repetido idempotente');
 await deny('start',randomUUID(),{order_id:b.id},'member','PT409');
 const other=randomUUID();ids.sessions.push(other);await operate('start',other,{order_id:a.id});check((await row('work_sessions','id',other)).status==='running','Varios trabajadores mismo pedido');
 for(const state of ['ready','confirmed','cancelled']){const r=await call('admin','transition_order',{target:a.id,expected_revision:await orev(a.id),payload:{state,reason:prefix}});check(r.error?.code==='PT409','Transición bloqueada '+state);}
 await operate('pause',sid,{},'member');await deny('pause',sid,{},'member','PT409');await operate('resume',sid,{},'member');await deny('resume',sid,{},'member','PT409');await operate('pause',sid,{},'member');await operate('finish',sid,{},'member');
 const closed=await row('work_sessions','id',sid),pauses=await h.rows('admin','work_pauses','work_session_id',sid);check(closed.status==='finished'&&pauses.some(p=>String(p.resumed_at)===String(closed.finished_at)),'Finalizar paused mismo timestamp');
 await operate('finish',other);check((await row('work_sessions','id',other)).status==='finished','Finalizar running');
 await deny('correct',sid,{activity:'no',reason:prefix},'member','42501');await deny('correct',sid,{user_id:h.users.admin,reason:prefix});await deny('correct',sid,{hourly_rate:'2',reason:prefix});
 await operate('correct',sid,{activity:'Actividad corregida',order_id:b.id,order_item_id:b.line,reason:prefix});
 const corrected=await row('work_sessions','id',sid);check(String(corrected.started_at)===String(closed.started_at)&&String(corrected.finished_at)===String(closed.finished_at)&&corrected.worked_seconds===closed.worked_seconds,'Atribución no cambia tiempo');
 const history=randomUUID();ids.sessions.push(history);
 const historical={order_id:a.id,order_item_id:a.line,user_id:h.users.member,started_at:ht(0),finished_at:ht(10900),hourly_rate:'500.01',reason:prefix,pauses:[]};
 await operate('historical',history,historical);check(Number((await row('work_sessions','id',history)).worked_seconds)===10,'FLOOR una sola vez');
 await deny('historical',randomUUID(),historical,'admin','PT409');await deny('historical',randomUUID(),{...historical,started_at:'2025-02-02T12:00:00Z',finished_at:'2025-02-02T12:00:10Z'},'member','42501');
 await operate('correct',history,{pauses:[{paused_at:ht(1000),resumed_at:ht(2100)},{paused_at:ht(3000),resumed_at:ht(4100)}],reason:prefix});check(Number((await row('work_sessions','id',history)).worked_seconds)===8,'Neto exacto menos múltiples pausas');
 await operate('correct',history,{pauses:[],reason:prefix});check(Number((await row('work_sessions','id',history)).worked_seconds)===10,'Corrección elimina pausas con evidencia');
 const tiny=randomUUID();ids.sessions.push(tiny);await operate('historical',tiny,{...historical,started_at:ht(3600000),finished_at:ht(3600800)});check(Number((await row('work_sessions','id',tiny)).worked_seconds)===0,'Sesión menor a un segundo conservada');
 const read=await ok('work_read',{target_order:a.id},'member');check(!JSON.stringify(read).includes('hourly_rate'),'Lectura operativa sin tarifa');check(read.sessions.some(s=>s.user_id===h.users.admin),'Historial de otros trabajadores visible');
 check((await h.rows('member','work_session_rates','work_session_id',sid)).length===0,'RLS tarifa oculta');
 const dateError=await call('admin','correct_order_dates',{target:a.id,expected_revision:await orev(a.id),payload:{confirmed_at:'2025-03-01T12:00:00Z',reason:prefix}});check(dateError.error?.code==='PT409','Fecha pedido no invalida horas');
 return {evidence,prefix,ids,helpers:{order,args,operate,deny,row,rev,orev,ok,check,call}};
}
