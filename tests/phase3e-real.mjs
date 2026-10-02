// DEV real integrado. Identidades/sesiones en memoria; sin borrado compensatorio.
import {devHarness} from './support/real-session.mjs';
import {businessDate,cents,deliveryAlert} from '../src/features/orders/domain.ts';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:30000});
const h=await devHarness(),evidence=[],matrix=[],screens=[],ids={order:randomUUID(),income:randomUUID(),expense:randomUUID(),categories:[randomUUID(),randomUUID()]};
let admin,member,admin2,inactive=false,stage='inicio';
const prefix='VERIFICACION-3E-'+Date.now();
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
async function row(table,id){const r=await admin.client.from(table).select('*').eq('id',id).single();if(r.error)throw Error('Lectura '+table+' '+r.error.code);return r.data;}
async function op(who,name,payload){const q=await row('quotes_read',ids.order);const r=await who.client.rpc(name,{target:ids.order,expected_revision:q.revision,payload});if(r.error)throw Error(name+' '+r.error.code);return r.data;}
async function counts(){const result={};for(const table of ['payments','manual_income','expenses']){const r=await admin.client.from(table).select('id',{count:'exact',head:true});if(r.error)throw Error('Conteo '+table);result[table]=r.count;}return result;}
async function sourceDelta(table,fn){const a=await counts();await fn();const b=await counts();for(const t of Object.keys(a))ok(b[t]-a[t]===(t===table?1:0),table+' solo incrementa '+table+'; delta '+t);}
async function financial(expectedPaid,status){const q=await row('quotes_read',ids.order);const f=await admin.client.from('order_payment_summary').select('*').eq('order_id',ids.order).single();ok(!f.error&&cents(f.data.total)===3000n&&cents(f.data.paid)===BigInt(expectedPaid)&&cents(f.data.balance)===3000n-BigInt(expectedPaid),'Importes derivados '+status);ok(q.production_status===status&&!!q.order_number&&cents(q.deposit_required_amount)===1500n,'Estado, número y adelanto histórico '+status);ok((deliveryAlert(q.requested_delivery_date,status)===null)===(status==='delivered'),'Alerta según estado '+status);return q;}
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);admin2=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);
 stage='integración';
 let r=await admin.client.from('clients').insert({name:prefix,phone:'83639663'}).select('id').single();if(r.error)throw Error('Cliente fixture');ids.client=r.data.id;
 r=await admin.client.from('product_categories').insert({name:prefix}).select('id').single();if(r.error)throw Error('Categoría producto fixture');ids.productCategory=r.data.id;
 r=await admin.client.from('products').insert({sku:prefix,name:prefix,category_id:ids.productCategory,base_price:'10.00'}).select('id').single();if(r.error)throw Error('Producto fixture');ids.product=r.data.id;
 ids.lines=[randomUUID(),randomUUID()];
 const payload={client_id:ids.client,order_date:businessDate(),requested_delivery_date:businessDate(),discount_amount:'0',notes:prefix,items:[{id:ids.lines[0],product_id:ids.product,product_name_snapshot:prefix,quantity:'2',unit_price:'10.00',discount_amount:'0',is_active:true},{id:ids.lines[1],product_name_snapshot:'Personalizada '+prefix,quantity:'1',unit_price:'10.00',discount_amount:'0',is_active:true}]};
 r=await member.client.rpc('save_quote',{target:ids.order,expected_revision:0,payload});ok(!r.error,'Cotización mixta catálogo/personalizada');
 const quote=await row('quotes_read',ids.order);ok(cents(quote.total)===3000n&&!quote.order_number&&!quote.confirmed_at&&quote.revision===1,'Cotización sin número y total exacto');
 const lines=(await admin.client.from('quote_items_read').select('*').eq('order_id',ids.order).order('id')).data;
 await op(admin,'confirm_order',{deposit_percentage:'50.00'});const confirmed=await financial(0,'confirmed');
 await sourceDelta('payments',async()=>{ids.payment=await op(member,'register_payment',{amount:'15.00',payment_method:'cash',notes:prefix});});await financial(1500,'confirmed');
 for(const state of ['in_production','ready','delivered']){await op(member,'transition_order',{state});await financial(1500,state);}
 // HTTP Date tiene precisión de un segundo; no usar el reloj de la PC como reloj de BD.
 const delivered=await row('quotes_read',ids.order);ok(Date.parse(delivered.delivered_at)>=Date.parse(confirmed.confirmed_at)&&Date.parse(delivered.delivered_at)<h.serverNow()+1000,'Cronología efectiva de entrega con reloj servidor');
 await sourceDelta('payments',async()=>{await op(member,'register_payment',{amount:'15.00',payment_method:'cash',notes:prefix});});await financial(3000,'delivered');ok((await row('quotes_read',ids.order)).delivered_at===delivered.delivered_at,'Cobro posterior no reabre entrega');
 await sourceDelta('manual_income',async()=>{const r=await admin.client.rpc('register_manual_income',{target:ids.income,payload:{amount:'7.25',description:prefix}});ok(!r.error,'Ingreso externo independiente');});
 for(const [i,id] of ids.categories.entries()){const r=await admin.client.rpc('save_expense_category',{target:id,expected_revision:0,payload:{name:prefix+' '+i,is_active:true}});ok(!r.error,'Categoría controlada '+i);}
 await sourceDelta('expenses',async()=>{const r=await member.client.rpc('register_expense',{target:ids.expense,payload:{category_id:ids.categories[0],amount:'2.25',currency:'CRC',description:prefix,order_id:ids.order,order_item_id:ids.lines[0]}});ok(!r.error,'Gasto propio vinculado a pedido y línea válida');});await financial(3000,'delivered');
 stage='snapshots';
 ok(!(await admin.client.from('clients').update({name:prefix+' corregido',is_active:false}).eq('id',ids.client)).error,'Cliente modificado/desactivado');
 ok(!(await admin.client.from('products').update({name:prefix+' corregido',base_price:'99.00',is_active:false}).eq('id',ids.product)).error,'Producto modificado/desactivado');
 ok(!(await admin.client.from('product_categories').update({name:prefix+' corregida',is_active:false}).eq('id',ids.productCategory)).error,'Categoría producto modificada/desactivada');
 ok(JSON.stringify((await row('quotes_read',ids.order)).client_snapshot)===JSON.stringify(quote.client_snapshot),'Snapshot cliente no cambia');
 ok(JSON.stringify((await admin.client.from('quote_items_read').select('*').eq('order_id',ids.order).order('id')).data)===JSON.stringify(lines),'Snapshots de ambas líneas no cambian');
 ok((await row('quotes_read',ids.order)).order_number===confirmed.order_number,'PED no se renumera');
 stage='reclasificación vs anulación';const before=await row('expenses_read',ids.expense);
 const race=await Promise.all([admin.client.rpc('reclassify_expense',{target:ids.expense,expected_revision:before.revision,new_category:ids.categories[1],reason:'Carrera 3E: clasificación'}),admin2.client.rpc('void_expense',{target:ids.expense,expected_revision:before.revision,reason:'Carrera 3E: anulación'})]);
 ok(race.filter(r=>!r.error).length===1&&race.filter(r=>r.status===409).length===1,'Reclasificación vs anulación: un éxito y un 409');
 const after=await row('expenses_read',ids.expense);for(const k of ['amount','currency','amount_crc','exchange_rate_applied','expense_date','created_by','created_at','order_id','order_item_id'])ok(after[k]===before[k],'Carrera conserva '+k);
 stage='Storage';
 // Producto desactivado mantiene historia; imagen de prueba registrada con infraestructura.
 const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#DD0675'}}).webp().toBuffer();const path=`products/${ids.product}/${randomUUID()}.webp`;
 ok(!(await h.service.storage.from('catalog-images').upload(path,bytes,{contentType:'image/webp',cacheControl:'0',upsert:false})).error,'Carga fixture privada sin overwrite');
 r=await h.service.rpc('register_catalog_image',{actor:admin.id,product:ids.product,object_path:path,caption_text:prefix,is_logo:false});ok(!r.error,'Metadato imagen auditado');ids.image=r.data;
 const ref=(await admin.client.from('order_files').select('id,path').limit(1)).data?.[0];if(!ref)throw Error('Falta referencia histórica');
 const files=[{id:ids.image,path,bucket:'catalog-images',route:'catalog-image'}, {...ref,bucket:'order-references',route:'order-file'}];
 for(const f of files){for(const who of [admin,member]){const res=await who.context.request.get(`http://localhost:3000/api/${f.route}/${f.id}`);ok(res.status()===200&&res.headers()['cache-control']==='private, no-store',f.bucket+' proxy autoriza perfil activo y no-store');ok(!!(await who.client.storage.from(f.bucket).download(f.path)).error,f.bucket+' SDK no expone bytes a JWT');}ok((await fetch(`http://localhost:3000/api/${f.route}/${f.id}`)).status===401,f.bucket+' proxy anónimo rechazado');}
 ok(!(await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id)).error,'Inactivación controlada');inactive=true;
 for(const f of files){ok((await member.context.request.get(`http://localhost:3000/api/${f.route}/${f.id}`)).status()===401,f.bucket+' inactivo pierde proxy calentado');ok(!!(await member.client.storage.from(f.bucket).download(f.path)).error,f.bucket+' inactivo sin caché SDK');}
 ok(!(await admin.client.from('profiles').update({status:'active'}).eq('id',member.id)).error,'Perfil restaurado');inactive=false;
 stage='UI integrada';
 for(const who of [admin,member])for(const width of [320,375,768,1024,1440]){
  await who.page.setViewportSize({width,height:900});await who.page.emulateMedia({reducedMotion:'reduce'});
  for(const route of ['/pedidos/'+ids.order,'/gastos/'+ids.expense,...(who===admin?['/ingresos-manuales/'+ids.income,'/categorias-gastos','/configuracion']:[])]){
   await who.page.goto('http://localhost:3000'+route);await who.page.waitForLoadState('networkidle');await expect(who.page.getByRole('heading',{level:1})).toBeVisible();await expect(who.page.getByRole('heading',{name:'No pudimos cargar esta página'})).toHaveCount(0);
   ok(await who.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin overflow '+(who===admin?'Admin':'Colaborador')+' '+width+' '+route.split('/')[1]);screens.push({role:who===admin?'Admin':'Colaborador',width,screen:route.split('/')[1]});
  }
 }
 for(const route of ['/ingresos-manuales/'+ids.income,'/categorias-gastos','/configuracion']){await member.page.goto('http://localhost:3000'+route);await expect(member.page).toHaveURL(/dashboard\?notice=forbidden/);ok(!(await member.page.content()).includes(prefix),'Ruta restringida no entrega contenido '+route.split('/')[1]);}
 const logs=(await admin.client.from('audit_log').select('action,user_id,created_at,metadata').eq('entity_id',ids.order)).data;
 for(const action of ['order.confirmed','order.payment_recorded','order.delivered'])ok(logs.some(l=>l.action===action&&l.user_id&&l.created_at&&l.metadata),'Auditoría reconstruible '+action);
 ok(!(await member.client.from('audit_log').select('id').eq('entity_id',ids.order)).data?.length,'Colaborador no consulta auditoría general');
 stage='completado';
}catch(error){console.error('FAIL '+stage+': '+error.message);process.exitCode=1;}
finally{
 if(inactive){const r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(r.error)throw Error('Restauración requerida');}
 if(admin){
  const q=await admin.client.from('quotes_read').select('production_status').eq('id',ids.order).maybeSingle();if(q.data?.production_status==='delivered')await op(admin,'transition_order',{state:'ready',reason:'Cierre de fixture integrado 3E'});if(q.data&&q.data.production_status!=='cancelled')await op(admin,'transition_order',{state:'cancelled',reason:'Cierre 3E; conservar evidencia'});
  const income=await admin.client.from('manual_income_read').select('status').eq('id',ids.income).maybeSingle();if(income.data?.status==='valid')await admin.client.rpc('void_manual_income',{target:ids.income,reason:'Cierre 3E; conservar evidencia'});
  const expense=await admin.client.from('expenses_read').select('status,revision').eq('id',ids.expense).maybeSingle();if(expense.data?.status==='valid')await admin.client.rpc('void_expense',{target:ids.expense,expected_revision:expense.data.revision,reason:'Cierre 3E; conservar evidencia'});
  for(const [i,id] of ids.categories.entries()){const r=await admin.client.from('expense_categories').select('revision').eq('id',id).maybeSingle();if(r.data)await admin.client.rpc('save_expense_category',{target:id,expected_revision:r.data.revision,payload:{name:prefix+' '+i,is_active:false}});}
  if(ids.image)await admin.client.from('product_images').update({is_active:false,is_main:false}).eq('id',ids.image);
  if(ids.product)await admin.client.from('products').update({is_active:false}).eq('id',ids.product);
  if(ids.productCategory)await admin.client.from('product_categories').update({is_active:false}).eq('id',ids.productCategory);
  if(ids.client)await admin.client.from('clients').update({is_active:false}).eq('id',ids.client);
 }
 await writeFile('test-results/phase3e-real-summary.json',JSON.stringify({stage,passed:evidence,matrix,screens,records:ids},null,2));await h.close();
}
