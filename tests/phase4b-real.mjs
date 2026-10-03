import {devHarness} from './support/real-session.mjs';
import {inventoryScenarios} from './support/phase4b-scenarios.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const h=await devHarness();let member,admin,result,restore=false;const additional=[];
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);const admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const clients={admin:admin.client,member:member.client};
 result=await inventoryScenarios({rpc:(who,name,args)=>clients[who].rpc(name,args),rows:async(who,t,k,v)=>{const r=await clients[who].from(t).select('*').eq(k,v);if(r.error)throw Error(r.error.message);return r.data;},client:async name=>{const r=await admin.client.from('clients').insert({name}).select('id').single();if(r.error)throw Error(r.error.message);return r.data.id;},materialActive:async(id,active)=>{const r=await admin.client.from('materials').update({is_active:active}).eq('id',id);if(r.error)throw Error(r.error.message);}});
 const {args,op,material,order,rev,orev,success,row}=result.helpers;
 const check=(v,label)=>{if(!v)throw Error(label);additional.push(label);console.log('PASS '+label);};
 const run=(client,a)=>client.rpc('inventory_operation',a);
 async function race(a,b,label){const r=await Promise.all([run(admin.client,a),run(admin2.client,b)]);check(r.filter(x=>!x.error).length===1&&r.filter(x=>x.error?.code==='PT409').length===1,label);return r;}
 const o=await order();let m=await material();
 await race(await args('consumption',m,{order_id:o.id,quantity:'2'}),await args('consumption',m,{order_id:o.id,quantity:'2'}),'Dos consumos excederían stock: un éxito y conflicto');
 check(Number((await row('inventory_stock_read','id',m)).stock)===1,'Stock no negativo tras carrera');
 m=await material();let a=await args('consumption',m,{order_id:o.id,quantity:'1'}),b=await args('consumption',m,{order_id:o.id,quantity:'1'});const r=await race(a,b,'Dos consumos válidos con misma revisión: conflicto explícito');
 const retry=r[0].error?a:b;retry.expected_revisions={[m]:await rev(m)};check(!(await run(admin.client,retry)).error,'Segundo consumo válido tras recarga explícita');
 m=await material();const full=await op('consumption',m,{order_id:o.id,quantity:'3'});
 await race(await args('return',m,{source_movement_id:full,quantity:'2'}),await args('return',m,{source_movement_id:full,quantity:'2'}),'Dos devoluciones concurrentes conservan remanente');
 m=await material('200000000','1');const limit=await op('consumption',m,{order_id:o.id,quantity:'2'});
 const boundary=await Promise.all([run(admin.client,await args('return',m,{source_movement_id:limit,quantity:'1'})),run(admin2.client,await args('return',m,{source_movement_id:limit,quantity:'2'}))]);
 check(boundary.filter(x=>!x.error).length===1&&boundary.filter(x=>['22023','PT409'].includes(x.error?.code)).length===1,'Devoluciones concurrentes alrededor del límite de precisión');
 check(Number((await row('inventory_valuations_read','material_id',m)).value_crc)===1,'Límite devuelve exactamente el valor original');
 m=await material();a=await args('consumption',m,{order_id:o.id,quantity:'1'});
 const entry=await Promise.all([run(admin.client,a),admin2.client.rpc('register_inventory_receipt',{target:randomUUID(),payload:{kind:'purchase',source_reference:result.prefix,lines:[{material_id:m,unit:'gramos',quantity:'1',amount:'2',currency:'CRC'}]},expected_revisions:a.expected_revisions})]);
 check(entry.filter(x=>!x.error).length===1&&entry.filter(x=>x.error?.code==='PT409').length===1,'Consumo vs recepción 4A: mismo lock y revisión');
 m=await material();await race(await args('consumption',m,{order_id:o.id,quantity:'1'}),await args('adjustment_negative',m,{quantity:'1'}),'Ajuste Admin vs consumo');
 const id=await op('consumption',m,{order_id:o.id,quantity:'0.5'});
 await race(await args('return',m,{source_movement_id:id,quantity:'0.5'}),await args('consumption',m,{order_id:o.id,quantity:'0.5'}),'Devolución vs consumo');
 m=await material();a=await args('consumption',m,{order_id:o.id,quantity:'1'});await race(a,a,'Mismo UUID concurrente: un registro');
 // La misma solicitud tampoco puede registrarse en dos tablas mediante operaciones distintas.
 const source=await op('consumption',m,{order_id:o.id,quantity:'0.25'}),destination=await order(),sharedRequest=randomUUID();
 const crossA=await args('attribution_correction',m,{source_movement_id:source,destination_order_id:destination.id},sharedRequest);
 const crossB=await args('adjustment_positive',m,{quantity:'0.25'},sharedRequest);
 await race(crossA,crossB,'UUID compartido entre atribución y movimiento: exactamente una operación');
 const [physical,attribution]=await Promise.all([admin.client.from('inventory_movements').select('id').eq('request_id',sharedRequest),admin.client.from('inventory_movement_attribution_corrections').select('id').eq('id',sharedRequest)]);
 check(!physical.error&&!attribution.error&&physical.data.length+attribution.data.length===1,'Idempotencia global entre tablas de evidencia');
 await success('transition_order',{target:o.id,expected_revision:await orev(o.id),payload:{state:'ready'}});m=await material();a=await args('consumption',m,{order_id:o.id,quantity:'1'});
 const transition=await Promise.all([run(admin.client,a),admin2.client.rpc('transition_order',{target:o.id,expected_revision:await orev(o.id),payload:{state:'delivered'}})]);
 check(!transition[1].error&&(!transition[0].error||transition[0].error.code==='PT409'),'Consumo vs entrega: commit previo o rechazo por estado/revisión');
 // Reversión multilínea de materiales diferentes, una sola transacción.
 const x=await material(null),y=await material(null),receipt=randomUUID();
 await success('register_inventory_receipt',{target:receipt,payload:{kind:'purchase',source_reference:result.prefix,lines:[x,y].map(material_id=>({material_id,unit:'gramos',quantity:'2',amount:'3',currency:'CRC'}))},expected_revisions:{[x]:'0',[y]:'0'}});
 const multi={target:randomUUID(),operation:'receipt_reversal',payload:{receipt_id:receipt,reason:result.prefix},expected_revisions:{[x]:'1',[y]:'1'},expected_orders:{}};
 check(!(await run(admin.client,multi)).error,'Reversión multilínea atómica');check(Number((await row('inventory_stock_read','id',x)).stock)===0&&Number((await row('inventory_stock_read','id',y)).stock)===0,'Ambas líneas compensadas');
 // DML directo y auxiliares privados bloqueados, sin intentos destructivos.
 for(const table of ['inventory_movements','inventory_movement_costs','inventory_movement_attribution_corrections','inventory_adjustment_cost_evidence']){
  for(const client of [admin.client,member.client]){const denied=await client.from(table).insert({});check(denied.error?.code==='42501','INSERT directo rechazado '+table);}
  const key=['inventory_movement_costs','inventory_adjustment_cost_evidence'].includes(table)?'movement_id':'id';
  const deniedUpdate=await member.client.from(table).update({[key]:randomUUID()}).eq(key,randomUUID());check(deniedUpdate.error?.code==='42501','UPDATE directo rechazado '+table);
 }
 check((await h.anon.from('inventory_operations_read').select('*')).error?.code==='42501','Anónimo sin lectura');
 check((await member.client.schema('private').rpc('inventory_write_4b',{})).error?.code==='PGRST106','private no expuesto');
 check(!(await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id)).error,'Inactivación temporal de cuenta de pruebas');restore=true;
 check((await member.client.from('inventory_operations_read').select('*')).data.length===0,'JWT vigente inactivo sin lectura');
 check((await run(member.client,a)).error?.code==='42501','JWT vigente inactivo sin RPC');
 await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);restore=false;
 console.log('TOTAL '+(result.evidence.length+additional.length));
}finally{
 if(restore)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase4b-real.json',JSON.stringify({environment:'Supabase DEV real',prefix:result?.prefix,ids:result?.ids,evidence:[...(result?.evidence??[]),...additional]},null,2));await h.close();
}
