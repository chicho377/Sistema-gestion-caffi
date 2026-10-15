import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
import {shipmentScenarios} from './support/phase4d-scenarios.mjs';
const h=await devHarness();let admin,member,restore=false,result;const extra=[];
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);const a2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),m2=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const clients={admin:admin.client,member:member.client};
 result=await shipmentScenarios({rpc:(who,name,args)=>clients[who].rpc(name,args),rows:async(who,t,k,v)=>{const r=await clients[who].from(t).select('*').eq(k,v);assert.equal(r.error,null);return r.data;},client:async name=>{const r=await admin.client.from('clients').insert({name}).select('id').single();assert.equal(r.error,null);return r.data.id;}});
 const {order,transition,args,operate,row,rev,orev,ok,expense}=result.helpers;
 const check=(v,label)=>{assert.ok(v,label);extra.push(label);console.log('PASS '+label);};
 async function setup(){const o=await order();await transition(o,'in_production');await transition(o,'ready');const s=randomUUID();await operate('create',s,{order_id:o,delivery_type:'shipping',delivery_address:'Dirección',courier:'Prueba'});result.ids.shipments.push(s);return {o,s};}
 const run=(c,a)=>c.rpc('shipment_operate',a);
 for(const [one,two] of [['advance','advance'],['cancel','advance'],['edit','advance']]){
  const {s}=await setup();await operate('advance',s);const x=await args(one,s,one==='cancel'?{reason:result.prefix}:one==='edit'?{delivery_address:'Otra dirección'}:{}),y=await args(two,s);
  const r=await Promise.all([run(admin.client,x),run(m2.client,y)]);check(r.filter(v=>!v.error).length===1&&r.some(v=>v.error?.code==='PT409'),'Carrera '+one+'/'+two);
 }
 const {o,s}=await setup();await operate('advance',s);const race=await Promise.all([run(member.client,await args('advance',s)),a2.client.rpc('transition_order',{target:o,expected_revision:await orev(o),payload:{state:'in_production',reason:result.prefix}})]);
 check(!race[1].error&&(!race[0].error||race[0].error.code==='PT409'),'Shipment vs retroceso pedido serializados');
 const after=await row('shipments',s);check(after.status==='preparing'||after.status==='shipped','Sin estado parcial en carrera pedido');
 const d=await setup(),dup=await args('advance',d.s);const rr=await Promise.all([run(member.client,dup),run(m2.client,dup)]);check(rr.every(v=>!v.error)&&await rev(d.s)===2,'UUID concurrente un solo efecto');
 await operate('advance',d.s);const cancelDelivery=await Promise.all([run(admin.client,await args('cancel',d.s,{reason:result.prefix})),run(m2.client,await args('advance',d.s))]);check(cancelDelivery.filter(v=>!v.error).length===1&&cancelDelivery.some(v=>v.error?.code==='PT409'),'Cancelación vs entrega concurrente');
 for(const table of ['shipments','shipment_finances','shipment_requests','shipment_finances_read']){
  for(const [role,c] of [['admin',admin.client],['member',member.client],['anon',h.anon]]){
   const r=await c.from(table).select('*').limit(1);check(role==='anon'?Boolean(r.error):!r.error,'SELECT '+table+' '+role);
   if(role==='member'&&table.includes('finances'))check(r.data.length===0,'Finanzas vacías para Colaborador '+table);
   const random=randomUUID();for(const [name,q] of [['INSERT',c.from(table).insert(table.includes('finances')?{shipment_id:random,paid_by:'business'}:{id:random})],['UPDATE',c.from(table).update(table.includes('finances')?{paid_by:'business'}:{id:random}).eq(table.includes('finances')?'shipment_id':'id',random)],['DELETE',c.from(table).delete().eq(table.includes('finances')?'shipment_id':'id',random)]])check((table.endsWith('_read')?['42501','55000']:['42501']).includes((await q).error?.code),'DML bloqueado '+role+' '+table+' '+name);
  }
 }
 assert.equal((await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id)).error,null);restore=true;
 for(const table of ['shipments','shipment_finances','shipment_requests','shipment_finances_read']){const r=await member.client.from(table).select('*');check(!r.error&&r.data.length===0,'Inactivo JWT vigente sin '+table);}
 check((await run(member.client,await args('advance',d.s))).error?.code==='42501','Inactivo no opera');
 check(Boolean((await run(h.anon,await args('advance',d.s))).error),'Anónimo no opera');
 assert.equal((await admin.client.from('profiles').update({status:'active'}).eq('id',member.id)).error,null);restore=false;
 const financial=await setup(),e=await expense(financial.o);await operate('link',financial.s,{expense_id:e,reason:result.prefix});
 async function receipt(){const material=await ok('save_material',{target_id:null,material_code:result.prefix+'-'+randomUUID().slice(0,8),material_name:result.prefix,material_category:'Validación',material_unit:'gramos',minimum:'1',enabled:true,cost:null,cost_currency:'CRC'});const id=randomUUID();await ok('register_inventory_receipt',{target:id,expected_revisions:{[material]:'0'},payload:{kind:'purchase',source_reference:result.prefix,lines:[{material_id:material,unit:'gramos',quantity:'1',amount:'1',currency:'CRC'}]}});return id;}
 const inventory=await receipt();let linked=await admin.client.rpc('link_inventory_expense',{target:inventory,expense:e});check(linked.error?.code==='PT409','Recepción no comparte gasto de envío');
 const e3=await expense(financial.o);await ok('link_inventory_expense',{target:inventory,expense:e3});linked=await run(admin.client,await args('link',financial.s,{expense_id:e3,reason:result.prefix}));check(linked.error?.code==='PT409','Envío no comparte gasto de recepción');
 const concurrent=await setup(),e4=await expense(concurrent.o),receipt2=await receipt();
 const association=await Promise.all([run(admin.client,await args('link',concurrent.s,{expense_id:e4,reason:result.prefix})),a2.client.rpc('link_inventory_expense',{target:receipt2,expense:e4})]);
 check(association.filter(v=>!v.error).length===1&&association.some(v=>v.error?.code==='PT409'),'Asociación envío/recepción concurrente exclusiva');
 const voidRace=await setup(),e5=await expense(voidRace.o);const vr=await Promise.all([run(admin.client,await args('link',voidRace.s,{expense_id:e5,reason:result.prefix})),a2.client.rpc('void_expense',{target:e5,expected_revision:(await row('expenses',e5)).revision,reason:result.prefix})]);
 check(!vr[1].error&&(!vr[0].error||vr[0].error.code==='22023'),'Anulación/vínculo serializados sin gasto inválido nuevo');
 const audit=await admin.client.from('audit_log').select('action,metadata,reason').eq('entity_type','shipments').in('entity_id',result.ids.shipments);assert.equal(audit.error,null);
 for(const op of ['create','edit','advance','back','cancel','correct','finance','link'])check(audit.data.some(x=>x.action==='shipment.'+op),'Auditoría '+op);
 check(audit.data.filter(x=>x.action!=='shipment.create').every(x=>x.metadata.before&&x.metadata.after),'Auditoría before/after');
 check((await member.client.from('audit_log').select('id').limit(1)).data?.length===0,'Colaborador sin auditoría');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4d-real.json',JSON.stringify({environment:'DEV real JWT',evidence:[...result.evidence,...extra],ids:result.ids},null,2));
 console.log('TOTAL',result.evidence.length+extra.length);
}finally{if(restore)assert.equal((await admin.client.from('profiles').update({status:'active'}).eq('id',member.id)).error,null);await h.close();}
