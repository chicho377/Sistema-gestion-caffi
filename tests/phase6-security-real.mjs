import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[],base=process.env.SIGCA_UI_URL??'http://localhost:3011';let admin,member,inactive=false;
const check=(v,n)=>{assert.ok(v,n);evidence.push(n);console.log('PASS '+n);};
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const charts=await member.client.rpc('report_charts',{first_day:'2026-01-01',last_day:'2026-12-31'});check(charts.error?.code==='42501','Series financieras denegadas');
 for(const table of ['inventory_valuations','work_session_rates','shipment_finances','audit_log']){const r=await member.client.from(table).select('*').limit(1);check(Boolean(r.error)||r.data.length===0,'Data API restringida '+table);}
 for(const route of ['/dashboard','/reportes?kind=hours'])for(const rsc of [false,true]){const response=await member.context.request.get(base+route,{headers:rsc?{RSC:'1'}:{}});const body=await response.text();check(response.status()===200&&!/global_profit|global_margin|tarifa_crc|costo_periodo_crc|valoracion_crc/.test(body),'Sin finanzas '+route+(rsc?' RSC':' HTML'));}
 const profile=await admin.client.from('profiles').select('status').eq('id',member.id).single();assert.equal(profile.data.status,'active');
 const change=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);assert.equal(change.error,null);inactive=true;
 for(const kind of ['inventory','hours','shipments','operation']){const r=await member.client.rpc('report_query',{kind,first_day:'1990-01-01',last_day:'2099-12-31'});check(r.error?.code==='42501','JWT vigente inactivo '+kind);}
 const dash=await member.client.rpc('dashboard_query',{first_day:'2026-01-01',last_day:'2026-12-31'});check(dash.error?.code==='42501','Dashboard inactivo');
 const ex=await member.context.request.get(base+'/reportes/export?kind=inventory&format=xlsx',{maxRedirects:0});check(ex.status()===401||ex.status()===403||ex.status()===307,'Exportación inactivo bloqueada');
 await writeFile('test-results/phase6-security.json',JSON.stringify({environment:'DEV JWT vigente y HTTP real',evidence},null,2));
}finally{if(inactive){const r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);assert.equal(r.error,null);}await h.close();}
