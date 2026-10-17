import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[];
const check=(v,n)=>{assert.ok(v,n);evidence.push(n);console.log('PASS '+n);};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const run=async(kind,filters={},user=admin,from='1990-01-01',to='2099-12-31',page=1,size=25)=>{const r=await user.client.rpc('report_query',{kind,first_day:from,last_day:to,filters,page_no:page,page_size:size});assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const results={};for(const kind of ['orders','balances','payments','cash','profit','inventory','movements','hours','shipments','audit','operation']){results[kind]=await run(kind);check(Array.isArray(results[kind].rows),'RPC real '+kind);if(!['operation','inventory','balances'].includes(kind)){check((await run(kind,{},admin,'1800-01-01','1800-01-01')).count===0,'Período vacío '+kind);}const page=await run(kind,{},admin,'1990-01-01','2099-12-31',1,1);check(page.rows.length<=1&&page.count===results[kind].count,'Paginación '+kind);if(page.rows[0]){const row=page.rows[0];const id=row.id??row.order_id;check((await run(kind,{record:id})).count>=1,'UUID conocido '+kind);}}
 for(const kind of ['orders','balances','payments','cash','profit','audit']){const r=await member.client.rpc('report_query',{kind,first_day:'1990-01-01',last_day:'2099-12-31'});check(r.error?.code==='42501','Colaborador RPC denegado '+kind);}
 for(const kind of ['inventory','movements','hours','shipments','operation']){const r=await run(kind,{},member);const s=JSON.stringify(r);check(!/valoracion_crc|promedio_crc|tarifa_crc|costo_periodo_crc|global_profit|global_margin|costo_operativo_crc|valor_interno_crc|delta_valor_crc/.test(s),'Colaborador sin columnas financieras '+kind);}
 const anon=await h.anon.rpc('dashboard_query',{first_day:'2026-01-01',last_day:'2026-12-31'});check(anon.error?.code==='42501','Anónimo rechazado');
 const manipulated=await admin.client.rpc('report_query',{kind:'hours',first_day:'2026-01-01',last_day:'2026-12-31',filters:{admin:true}});check(manipulated.error?.code==='22023','Parámetros manipulados rechazados');
 const cents=v=>BigInt(String(v).replace('.','').padEnd(String(v).includes('.')?String(v).replace('.','').length: String(v).length+2,'0'));
 const cash=await run('cash',{},admin,'1990-01-01','2099-12-31',1,5000);assert.ok(cash.count<=5000);let sum=0n;for(const r of cash.rows)if(r.estado==='valid')sum+=(r.source_type==='expenses'?-1n:1n)*cents(r.monto_crc);check(sum===cents(cash.summary.movimiento_neto_crc),'Caja reconciliada por fuentes y estado');
 const profit=await run('profit',{},admin,'1990-01-01','2099-12-31',1,5000);for(const row of profit.rows.slice(0,15)){const c=await admin.client.rpc('order_costing',{target:row.order_id});assert.equal(c.error,null);assert.deepEqual(row,c.data);}check(true,'Rentabilidad idéntica a Fase 5 (15 pedidos)');
 const d=await member.client.rpc('dashboard_query',{first_day:'2026-01-01',last_day:'2026-12-31'});assert.equal(d.error,null);check(!d.data.cash&&!d.data.sales&&!d.data.profit,'Dashboard miembro solo operacional');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase6-real.json',JSON.stringify({environment:'DEV JWT real',evidence,examples:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.rows[0]?.id??v.rows[0]?.order_id]))},null,2));
 console.log('TOTAL '+evidence.length);
}finally{await h.close();}
