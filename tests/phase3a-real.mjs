// Opt-in DEV: sesiones solo en memoria, datos etiquetados conservados/cancelados. Nunca borra usuarios ni filas.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
if(process.env.SIGCA_REAL_TESTS!=="1") throw Error("Requiere SIGCA_REAL_TESTS=1");
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(url!=="https://pysgfnwsycgoneaecgcl.supabase.co") throw Error('Proyecto incorrecto');
const privileged=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch();const sessions=[];const evidence=[];let stage='inicio',admin,member,inactive=false;
const prefix='VERIFICACION-F3A-'+Date.now();let clientId,productId,orderId;const createdOrders=[];
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS: '+label);}
async function session(email){
 if(!email)throw Error('Falta correo de prueba');
 const {data:users}=await privileged.auth.admin.listUsers();const identity=users?.users.find(u=>u.email===email);
 if(!identity?.email_confirmed_at)throw Error('Cuenta confirmada existente requerida');
 const {data:link,error}=await privileged.auth.admin.generateLink({type:'magiclink',email});
 if(error)throw Error('No se pudo preparar sesión');
 const jar=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
 const result=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});if(result.error)throw Error('No se pudo autenticar');
 const context=await browser.newContext();await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})));
 const api=createClient(url,key,{accessToken:async()=>result.data.session.access_token,global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(25000)})}});
 const value={client:api,authClient:client,context,page:await context.newPage(),id:identity.id};sessions.push(value);return value;
}
const go=async(who,path)=>{stage=path;await who.page.goto('http://localhost:3000'+path);};
const header=async(id)=>{const {data,error}=await admin.client.from('quotes_read').select('*').eq('id',id).single();if(error)throw Error('No se pudo leer cotización');return data;};
async function payload(id){const o=await header(id);const {data:rows}=await admin.client.from('quote_items_read').select('*').eq('order_id',id).order('created_at');return {client_id:o.client_id,order_date:o.order_date,requested_delivery_date:o.requested_delivery_date,notes:o.notes,discount_amount:o.discount_amount,items:rows.map(r=>({id:r.id,product_id:r.product_id,product_name_snapshot:r.product_name_snapshot,description_snapshot:r.description_snapshot,quantity:String(r.quantity),unit_price:r.unit_price,discount_amount:r.discount_amount,customization:r.customization,notes:r.notes,is_active:r.is_active}))};}
try{
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=(await admin.client.from('profiles').select('role,status').eq('id',admin.id).single()).data;
 const m=(await member.client.from('profiles').select('role,status').eq('id',member.id).single()).data;
 ok(a?.role==='admin'&&m?.role==='collaborator'&&a.status==='active'&&m.status==='active','Identidades reales y activas');
 const c=await admin.client.from('clients').insert({name:prefix,phone:'83639663'}).select('id').single();if(c.error)throw Error('Cliente de prueba');clientId=c.data.id;
 const p=await admin.client.from('products').insert({sku:prefix,name:prefix+' producto',description:'Snapshot original',base_price:12.5}).select('id').single();if(p.error)throw Error('Producto de prueba');productId=p.data.id;
 await go(member,'/pedidos/nuevo');
 await member.page.locator('select[name=client_id]').selectOption(clientId);
 await member.page.getByLabel('Producto de catálogo').selectOption(productId);
 await member.page.getByRole('button',{name:'Agregar línea'}).click();
 await member.page.getByLabel('Cantidad línea 1',{exact:true}).fill('2');
 await member.page.getByLabel('Descuento línea 1',{exact:true}).fill('0.10');
 await member.page.getByRole('button',{name:'Agregar línea'}).click();
 await member.page.getByLabel('Nombre línea 2',{exact:true}).fill('Personalizada '+prefix);
 await member.page.getByLabel('Precio línea 2',{exact:true}).fill('0.10');
 await member.page.getByLabel('Descuento general CRC').fill('1.00');
 await member.page.locator('textarea[name=notes]').fill(prefix);
 await member.page.getByRole('button',{name:'Guardar cotización'}).click();
 await expect(member.page).toHaveURL(/\/pedidos\/[a-f0-9-]{36}$/,{timeout:20000});orderId=member.page.url().split('/').at(-1);createdOrders.push(orderId);
 let o=await header(orderId);ok(o.total==='24.00'&&o.production_status==='quote'&&o.order_number===null&&o.confirmed_at===null&&o.delivered_at===null,'UI real: creación catálogo + personalizada, total 24.00, sin confirmación');
 await member.page.locator('textarea[name=notes]').fill(prefix+' editado');await member.page.getByRole('button',{name:'Guardar cotización'}).click();await expect(member.page.getByText('Cotización guardada').first()).toBeVisible();
 await expect.poll(async()=>(await header(orderId)).notes).toBe(prefix+' editado');
 ok(true,'Edición UI persistida en DEV');
 o=await header(orderId);let doc=await payload(orderId);
 const tampered=await member.client.rpc('save_quote',{target:orderId,expected_revision:o.revision,payload:{...doc,total:'0'}});ok(!!tampered.error,'API directa rechaza total manipulado');
 for(const [field,value] of [['unit_price','0.125'],['quantity','0'],['quantity','-1'],['quantity','1.5'],['quantity','NaN'],['quantity','Infinity']]){
 const invalid=structuredClone(doc);invalid.items[1][field]=value;
 ok(!!(await member.client.rpc('save_quote',{target:orderId,expected_revision:o.revision,payload:invalid})).error,'API rechaza '+field+'='+value);
 }
 const bad=structuredClone(doc);bad.items[0].unit_price='13';bad.items[1].quantity='0';
 await member.client.rpc('save_quote',{target:orderId,expected_revision:o.revision,payload:bad});
 ok((await header(orderId)).revision===o.revision&&(await header(orderId)).total===o.total,'Rollback API conserva revisión y total');
 const race=await Promise.all([member.client.rpc('save_quote',{target:orderId,expected_revision:o.revision,payload:doc}),admin.client.rpc('save_quote',{target:orderId,expected_revision:o.revision,payload:doc})]);
 console.log('Concurrencia códigos:',race.map(r=>r.error?.code??'OK'));
 ok(race.filter(r=>!r.error).length===1&&race.filter(r=>r.error?.code==='PT409').length===1,'Concurrencia real: una edición gana y otra recibe conflicto');
 for(const mutation of [{total:0},{production_status:'confirmed'},{production_status:'quote',order_number:'PED-2026-00001'},{created_at:'2000-01-01'}])ok(!!(await member.client.from('orders').update(mutation).eq('id',orderId)).error,'DML directo protegido: '+Object.keys(mutation).join(','));
 ok(!!(await member.client.from('orders').delete().eq('id',orderId)).error,'DELETE denegado');
 ok(!(await member.client.from('audit_log').select('id')).data?.length,'Auditoría no visible a Colaborador');
 ok(!!(await anon.from('orders').select('id')).error,'Anónimo sin lectura');
 ok((await member.client.schema('private').rpc('save_quote',{})).error?.code==='PGRST106','Esquema private fuera de Data API');
 await go(admin,'/pedidos/'+orderId);await expect(admin.page.getByRole('heading',{name:'Cotización',exact:true})).toBeVisible();ok(true,'Administrador consulta detalle en UI real');
 await admin.client.from('products').update({name:prefix+' cambiado',is_active:false}).eq('id',productId);
 await admin.client.from('clients').update({is_active:false}).eq('id',clientId);
 await go(member,'/pedidos/'+orderId);
 const catalogLine=member.page.locator('fieldset.quote-line').filter({has:member.page.locator('input[value="'+prefix+' producto"]')});
 await expect(catalogLine.locator('textarea[readonly]')).toHaveValue('Snapshot original');
 await member.page.getByRole('button',{name:'Guardar cotización'}).click();
 await expect(member.page.getByText('Cotización guardada').first()).toBeVisible();
 ok(true,'Cliente/producto inactivos conservan pedido y snapshots editables');
 await catalogLine.getByRole('button',{name:/Desactivar línea/}).click();await member.page.getByLabel('Descuento general CRC').fill('0');await member.page.getByRole('button',{name:'Guardar cotización'}).click();
 await expect.poll(async()=>(await header(orderId)).total).toBe('0.10');ok(true,'Desactivación de línea conserva fila y recalcula total');
 await member.page.getByLabel('Imagen de referencia').setInputFiles({name:'falso.png',mimeType:'image/png',buffer:Buffer.from('<svg>no es PNG</svg>')});
 await member.page.getByRole('button',{name:'Guardar referencia'}).click();await expect(member.page.getByRole('alert').filter({hasText:'No se pudo cargar'})).toBeVisible();
 ok(!(await member.client.from('order_files').select('id').eq('order_id',orderId)).data?.length,'Archivo con extensión/MIME falsos rechazado sin metadato');
 const image=await sharp({create:{width:100,height:80,channels:3,background:'#FFD6E4'}}).png().toBuffer();
 await member.page.getByLabel('Imagen de referencia').setInputFiles({name:'referencia.png',mimeType:'image/png',buffer:image});
 await member.page.getByLabel('Descripción de referencia',{exact:true}).fill('Referencia F3A');await member.page.getByRole('button',{name:'Guardar referencia'}).click();
 await expect(member.page.getByText('Referencia guardada').first()).toBeVisible({timeout:20000});
 let files=(await member.client.from('order_files').select('*').eq('order_id',orderId)).data;ok(files?.length===1,'Archivo real registrado');
 const first=files[0];const download=await member.context.request.get('http://localhost:3000/api/order-file/'+first.id);ok(download.status()===200&&download.headers()['cache-control']==='private, no-store','Descarga autorizada sin caché compartida');
 ok(!!(await anon.storage.from('order-references').download(first.path)).error,'Storage real privado frente a anónimo');
 ok(!!(await member.client.storage.from('order-references').upload(`orders/${orderId}/${randomUUID()}.webp`,image,{contentType:'image/webp'})).error,'Upload directo rechazado');
 await member.page.getByLabel('Imagen de referencia').setInputFiles({name:'referencia2.png',mimeType:'image/png',buffer:image});await member.page.getByLabel('Reemplazar referencia').selectOption(first.id);await member.page.getByRole('button',{name:'Guardar referencia'}).click();
 await expect.poll(async()=>((await member.client.from('order_files').select('id').eq('order_id',orderId)).data??[]).length).toBe(2);
 files=(await member.client.from('order_files').select('*').eq('order_id',orderId)).data;
 ok(files.length===2&&files.filter(f=>f.is_active).length===1&&(await member.client.storage.from('order-references').download(first.path)).data,'Reemplazo conserva metadato y bytes anteriores');
 await mkdir('test-results',{recursive:true});
 for(const width of [320,375,768,1024,1440]){
 await member.page.setViewportSize({width,height:950});await go(member,'/pedidos/'+orderId);await expect(member.page.getByRole('heading',{name:'Cotización',exact:true})).toBeVisible();
 ok(await member.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Detalle responsive real '+width);
 await member.page.screenshot({path:`test-results/phase3a-real-detail-${width}.png`,fullPage:true});
 await go(member,'/pedidos?q='+prefix);await expect(member.page.getByRole('link',{name:'Ver / editar'}).first()).toBeVisible();
 ok(await member.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Listado responsive real '+width);
 }
 await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);inactive=true;
 ok(!(await member.client.from('orders').select('id')).data?.length,'JWT previo pierde lectura inmediatamente al inactivar');
 ok(!!(await member.client.rpc('cancel_quote',{target:orderId,expected_revision:(await header(orderId)).revision,reason:'Intento inactivo'})).error,'Inactivo no cancela');
 ok((await member.context.request.get('http://localhost:3000/api/order-file/'+first.id)).status()===401,'Inactivo pierde descarga');
 await go(member,'/pedidos');await expect(member.page).toHaveURL(/login/);
 await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);inactive=false;
 await go(member,'/pedidos/'+orderId);
 await member.page.getByRole('button',{name:'Cancelar cotización',exact:true}).click();await member.page.getByRole('textbox',{name:'Motivo obligatorio'}).fill('Prueba real completada, se conserva evidencia');await member.page.locator('.swal2-confirm').click();
 await expect(member.page.getByRole('heading',{name:'Cotización cancelada'})).toBeVisible();
 await expect(member.page.getByRole('button',{name:'Guardar cotización'})).toHaveCount(0);await expect(member.page.getByRole('button',{name:'Guardar referencia'})).toHaveCount(0);
 ok((await header(orderId)).production_status==='cancelled','Cancelación real UI con motivo');
 ok(!!(await member.client.rpc('save_quote',{target:orderId,expected_revision:(await header(orderId)).revision,payload:doc})).error,'Cancelado terminal ante API');
 const logs=(await admin.client.from('audit_log').select('action,reason').eq('entity_id',orderId)).data;
 ok(logs.some(l=>l.action==='quote.cancelled'&&l.reason)&&logs.some(l=>l.action==='orders.update'),'Admin verifica auditoría y motivo');
 stage='completado';
}catch(error){console.error('FAIL etapa '+stage+': '+error.message);if(member){console.error('Ruta final: '+new URL(member.page.url()).pathname);await mkdir('test-results',{recursive:true});await member.page.screenshot({path:'test-results/phase3a-real-failure.png',fullPage:true});}process.exitCode=1;}
finally{
 if(inactive&&admin&&member) await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 if(admin){for(const id of createdOrders){const o=await header(id);if(o.production_status==='quote')await admin.client.rpc('cancel_quote',{target:id,expected_revision:o.revision,reason:'Cierre de datos de verificación F3A; sin borrado'});}
 if(productId)await admin.client.from('products').update({is_active:false}).eq('id',productId);
 if(clientId)await admin.client.from('clients').update({is_active:false}).eq('id',clientId);}
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3a-real-summary.json',JSON.stringify({stage,passed:evidence,records:{clientId,productId,orderId}},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
