import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
import {workScenarios} from './support/phase4c-scenarios.mjs';
const h=await devHarness();let admin,member,result,originalRate,restoreRate=false,restoreMember=false;const extra=[],owned=[];
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member2=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const clients={admin:admin.client,member:member.client},users={admin:admin.id,member:member.id};
 const existing=await admin.client.from('work_sessions').select('id').in('user_id',Object.values(users)).neq('status','finished');assert.equal(existing.error,null);assert.equal(existing.data.length,0,'No intervenir sesiones abiertas existentes');
 const settings=await admin.client.from('settings').select('hourly_rate').single();assert.equal(settings.error,null);originalRate=settings.data.hourly_rate;restoreRate=true;
 const setRate=async value=>admin.client.from('settings').update({hourly_rate:value}).eq('singleton',true);
 const rows=async(who,table,key,id)=>{const r=await clients[who].from(table).select('*').eq(key,id);assert.equal(r.error,null);return r.data;};
 result=await workScenarios({users,setRate,rate:async v=>assert.equal((await setRate(v)).error,null),rpc:(who,name,args)=>clients[who].rpc(name,args),rows,client:async name=>{const r=await admin.client.from('clients').insert({name}).select('id').single();assert.equal(r.error,null);return r.data.id;}});
 const {order,args,operate,row,orev,ok}=result.helpers;
 const check=(v,label)=>{assert.ok(v,label);extra.push(label);console.log('PASS '+label);};
 const run=(c,a)=>c.rpc('work_operate',a);
 const startArgs=async(o,who='admin')=>{const id=randomUUID();owned.push(id);return {...await args('start',id,{order_id:o.id}),who};};
 const cleanArgs=a=>{const b={...a};delete b.who;return b;};
 async function finish(id){const s=await row('work_sessions','id',id);if(s&&s.status!=='finished')await operate('finish',id,s.user_id!==admin.id?{reason:result.prefix}:{});}
 const a=await order(),b=await order();
 for(const distinct of [false,true]){
 const x=cleanArgs(await startArgs(a)),y=cleanArgs(await startArgs(distinct?b:a));const r=await Promise.all([run(member.client,x),run(member2.client,y)]);
 check(r.filter(v=>!v.error).length===1&&r.filter(v=>v.error?.code==='PT409').length===1,distinct?'Play distintos pedidos concurrente':'Doble Play concurrente');for(const id of [x.target,y.target])await finish(id);
 }
 const duplicate=cleanArgs(await startArgs(a));const dup=await Promise.all([run(admin.client,duplicate),run(admin2.client,duplicate)]);check(dup.every(r=>!r.error&&r.data===duplicate.target),'Mismo UUID concurrente idempotente');await finish(duplicate.target);
 for(const pair of [['pause','finish'],['resume','finish'],['pause','finish']]){
 const st=cleanArgs(await startArgs(a));assert.equal((await run(member.client,st)).error,null);if(pair[0]==='resume')await operate('pause',st.target,{},'member');
 const r=await Promise.all([run(member.client,await args(pair[0],st.target)),run(admin2.client,await args(pair[1],st.target,{reason:result.prefix}))]);check(r.filter(v=>!v.error).length===1&&r.some(v=>v.error?.code==='PT409'),'Carrera '+pair.join('/')+' '+extra.length);await finish(st.target);
 }
 for(const state of ['ready','confirmed','cancelled']){
 const o=await order(),st=cleanArgs(await startArgs(o));const r=await Promise.all([run(member.client,st),admin2.client.rpc('transition_order',{target:o.id,expected_revision:await orev(o.id),payload:{state,reason:result.prefix}})]);
 check(r.filter(v=>!v.error).length===1&&r.some(v=>v.error?.code==='PT409'),'Transición/Play '+state);await finish(st.target);
 }
 const st=cleanArgs(await startArgs(a));await ok('work_operate',st,'member');
 assert.equal((await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id)).error,null);restoreMember=true;
 check((await run(member.client,await args('pause',st.target))).error?.code==='42501','Inactivo JWT previo sin operación');check((await member.client.from('work_sessions').select('id')).data.length===0,'Inactivo sin lectura');
 await operate('finish',st.target,{reason:result.prefix});check((await row('work_sessions','id',st.target)).status==='finished','Admin cierra trabajador inactivo');
 const hist=await order(),hid=randomUUID();owned.push(hid);const base=new Date(Date.now()-86400000*200),end=new Date(base.getTime()+800);
 await operate('historical',hid,{order_id:hist.id,user_id:member.id,started_at:base.toISOString(),finished_at:end.toISOString(),hourly_rate:'111.11',reason:result.prefix});check(Number((await row('work_sessions','id',hid)).worked_seconds)===0,'Histórico de trabajador inactivo y cero segundos');
 await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);restoreMember=false;
 for(const state of ['delivered','cancelled']){
 const o=await order();await ok('transition_order',{target:o.id,expected_revision:await orev(o.id),payload:{state:'ready'}});await ok('transition_order',{target:o.id,expected_revision:await orev(o.id),payload:{state,reason:result.prefix}});
 const id=randomUUID();owned.push(id);const t=new Date(base.getTime()+(state==='delivered'?10000:20000));await operate('historical',id,{order_id:o.id,user_id:admin.id,started_at:t.toISOString(),finished_at:new Date(t.getTime()+1000).toISOString(),hourly_rate:'111.11',reason:result.prefix});check((await row('work_sessions','id',id)).status==='finished','Histórico '+state);
 }
 for(const table of ['work_sessions','work_pauses','work_session_rates','work_session_requests'])for(const who of ['admin','member']){
 check((await clients[who].from(table).insert({})).error?.code==='42501','DML INSERT '+who+' '+table);
 const key=table==='work_session_rates'?'work_session_id':'id';check((await clients[who].from(table).update({[key]:randomUUID()}).eq(key,randomUUID())).error?.code==='42501','DML UPDATE '+who+' '+table);
 }
 check((await h.anon.from('work_sessions').select('*')).error?.code==='42501','Anónimo sin lectura');check((await h.anon.rpc('work_read')).error!=null,'Anónimo sin RPC');
 check((await member.client.schema('private').rpc('work_read')).error?.code==='PGRST106','private no expuesto');
 const all=[];for(let offset=0;;offset+=500){const r=await admin.client.from('work_sessions').select('*').eq('status','finished').order('id').range(offset,offset+499);assert.equal(r.error,null);all.push(...r.data);if(r.data.length<500)break;}
 // Exact integer microseconds, independent from the SQL implementation.
 const micros=s=>{const m=s.match(/\.(\d+)(?=[+-]|Z)/),fraction=(m?.[1]??'').padEnd(6,'0').slice(0,6);return BigInt(Date.parse(s.replace(/\.\d+(?=[+-]|Z)/,'')))*1000n+BigInt(fraction);};
 for(const s of all){const pauses=await rows('admin','work_pauses','work_session_id',s.id);const net=micros(s.finished_at)-micros(s.started_at)-pauses.reduce((n,p)=>n+micros(p.resumed_at)-micros(p.paused_at),0n);assert.equal(BigInt(s.worked_seconds),net/1000000n);}
 check(true,'Reconstrucción independiente: '+all.length+' sesiones, cero diferencias');
 console.log('TOTAL '+(result.evidence.length+extra.length));
}finally{
 if(admin){if(restoreMember)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(restoreRate)await admin.client.from('settings').update({hourly_rate:originalRate}).eq('singleton',true);}
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4c-real.json',JSON.stringify({environment:'Supabase DEV real',ids:{...result?.ids,extra:owned},evidence:[...(result?.evidence??[]),...extra]},null,2));await h.close();
}
