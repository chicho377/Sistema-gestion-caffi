import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import {devHarness} from './support/real-session.mjs';
const expect=baseExpect.configure({timeout:30000}),h=await devHarness(),evidence=[];
const base=process.env.SIGCA_UI_URL??'http://localhost:3004',prefix='VALIDACION-4D-UI-'+Date.now();
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const ok=async(name,args)=>{const r=await admin.client.rpc(name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
 const c=await admin.client.from('clients').insert({name:prefix,address:'Dirección snapshot'}).select('id').single();assert.equal(c.error,null);
 for(const [role,u] of [['admin',admin],['member',member]]){
  const order=randomUUID(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await ok('save_quote',{target:order,expected_revision:0,payload:{client_id:c.data.id,order_date:today,requested_delivery_date:today,discount_amount:'0',items:[{id:randomUUID(),product_name_snapshot:prefix,quantity:'1',unit_price:'10',discount_amount:'0',is_active:true}]}});
  await ok('confirm_order',{target:order,expected_revision:1,payload:{deposit_percentage:'0'}});await ok('transition_order',{target:order,expected_revision:2,payload:{state:'in_production'}});await ok('transition_order',{target:order,expected_revision:3,payload:{state:'ready'}});
  const p=u.page;let payloads='';p.on('response',async r=>{if(r.url().includes('/envios')&&r.request().method()==='POST'){try{payloads+=await r.text();}catch{}}});
  await p.setViewportSize({width:320,height:900});await p.goto(`${base}/envios?order=${order}`);await p.waitForLoadState('networkidle');await p.getByLabel('Tipo de entrega').selectOption('shipping');await p.getByLabel('Transportista',{exact:true}).fill('Mensajería de prueba');await p.getByRole('button',{name:'Crear envío',exact:true}).click();await expect(p.getByRole('button',{name:'Preparar',exact:true})).toBeVisible();
  const read=async()=>{const r=await admin.client.from('shipments').select('*').eq('order_id',order).single();assert.equal(r.error,null);return r.data;};
  const s=await read();check(s.delivery_address==='Dirección snapshot',role+' creación UI usa snapshot');
  await ok('shipment_operate',{request_id:randomUUID(),operation:'finance',target:s.id,expected_revision:s.revision,payload:{paid_by:'customer_direct',cost_crc:'8357.21',reason:prefix}});
  for(const width of [320,375,768,1024,1440]){
   await p.setViewportSize({width,height:900});await p.emulateMedia({reducedMotion:'reduce'});await p.goto(`${base}/envios?order=${order}`);await p.waitForLoadState('networkidle');
   if(role==='admin'){await p.getByText('Corregir datos históricos',{exact:true}).click();await p.getByText('Vincular, sustituir o desvincular gasto',{exact:true}).click();await p.getByText('Registrar o corregir costo efectivo',{exact:true}).click();}
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' '+width+' sin overflow');
   check((await p.getByRole('button',{name:'Preparar',exact:true}).boundingBox()).height>=43,role+' '+width+' control táctil');
   check(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),role+' '+width+' reduced-motion');
   const html=await p.content();if(role==='member')check(!html.includes('8357.21')&&!html.includes('8.357,21')&&!html.includes('Costo del envío'),role+' '+width+' HTML sin costo');
   await mkdir('test-results/phase4d-ui',{recursive:true});await p.screenshot({path:`test-results/phase4d-ui/${role}-${width}.png`,fullPage:true});
  }
  for(const label of ['Preparar','Despachar','Registrar entrega']){await p.getByRole('button',{name:label,exact:true}).click();await p.locator('.swal2-confirm').click();await expect.poll(async()=>(await read()).status).toBe(label==='Preparar'?'preparing':label==='Despachar'?'shipped':'delivered');check(true,role+' UI '+label);}
  const o=await admin.client.from('orders').select('production_status').eq('id',order).single();check(o.data.production_status==='ready',role+' entrega no cambia pedido');
  if(role==='member')check(!payloads.includes('8357.21')&&!payloads.includes('cost_crc'),role+' RSC sin costos');
  if(role==='admin'){
   await p.getByRole('button',{name:'Retroceder',exact:true}).click();await p.locator('.swal2-textarea').fill(prefix);await p.locator('.swal2-confirm').click();await expect.poll(async()=>(await read()).status).toBe('shipped');check(true,'Retroceso Admin UI motivado');
   await p.getByRole('button',{name:'Cancelar envío',exact:true}).click();await p.locator('.swal2-textarea').fill(prefix);await p.locator('.swal2-confirm').click();await expect.poll(async()=>(await read()).status).toBe('cancelled');check(Boolean((await read()).shipped_at),'Cancelación UI conserva despacho');
  }
  await p.goto(`${base}/envios`);await p.waitForLoadState('networkidle');check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' listado responsive');
 }
 await writeFile('test-results/phase4d-ui.json',JSON.stringify({environment:'DEV real UI',evidence},null,2));
}finally{await h.close();}
