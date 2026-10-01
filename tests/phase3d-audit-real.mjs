import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const expect=baseExpect.configure({timeout:30000});
if(process.env.SIGCA_REAL_TESTS!=='1')throw Error('Requiere SIGCA_REAL_TESTS=1');
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(url!=='https://pysgfnwsycgoneaecgcl.supabase.co')throw Error('Proyecto incorrecto');
const privileged=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch(),sessions=[],evidence=[],matrix=[],ids=[];
let admin,member,inactive=false,stage='inicio';const prefix='AUDITORIA-F3D-'+Date.now();
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
async function session(email){
 const {data:users}=await privileged.auth.admin.listUsers();const identity=users?.users.find(u=>u.email===email);
 if(!identity?.email_confirmed_at)throw Error('Cuenta confirmada existente requerida');
 const {data:link,error}=await privileged.auth.admin.generateLink({type:'magiclink',email});if(error)throw Error('No se pudo preparar sesión');
 const jar=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
 const result=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});if(result.error)throw Error('No se pudo autenticar');
 const context=await browser.newContext();await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})));
 const api=createClient(url,key,{accessToken:async()=>result.data.session.access_token,global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(25000)})}});
 const value={client:api,authClient:client,context,page:await context.newPage(),id:identity.id};sessions.push(value);return value;
}
const categoryId=randomUUID(),orphanPaths=[];
let categoryRevision=1;
const read=async id=>{const r=await admin.client.from('expenses_read').select('*').eq('id',id).single();if(r.error)throw Error('Lectura '+r.error.code);return r.data;};
const create=async(who,payload,id=randomUUID())=>{ids.push(id);const r=await who.rpc('register_expense',{target:id,payload});if(r.error)throw Error('Alta '+r.error.code);return id;};
const go=async(who,path)=>{await who.page.goto('http://localhost:3000'+path);await who.page.waitForLoadState('networkidle');await expect(who.page.getByRole('heading',{name:'No pudimos cargar esta página'})).toHaveCount(0);};
async function permissionMatrix(who,label,targets,active){
 for(const [table,target] of Object.entries(targets)){
  const writes=await Promise.all([
   who.from(table).select('id').eq('id',target),
   who.from(table).insert({id:randomUUID()}),
   who.from(table).update({id:randomUUID()}).eq('id',target).neq('id',target),
   who.from(table).delete().eq('id',target).neq('id',target),
   table==='expense_categories'?who.rpc('save_expense_category',{target:randomUUID(),expected_revision:0,payload:{}}):table==='expenses'?who.rpc('register_expense',{target:randomUUID(),payload:{}}):who.rpc('register_expense_file',{actor:member.id,target:targets.expenses,expected_revision:1,object_path:'invalid',caption_text:'',size_bytes:1})
  ]);
  ok(active?!writes[0].error&&writes[0].data.length===1:!!writes[0].error||writes[0].data.length===0,label+' SELECT '+table);
  for(let i=1;i<4;i++)ok(writes[i].error?.code==='42501',label+' '+['','INSERT','UPDATE','DELETE'][i]+' '+table);
  const rpcAllowed=active&&(table==='expenses'||(table==='expense_categories'&&label==='Admin'));
  ok(writes[4].error?.code===(rpcAllowed?'22023':'42501'),label+' RPC '+table);
  matrix.push({actor:label,table,select:active?'fila autorizada':'sin acceso',insert:writes[1].status,update:writes[2].status,delete:writes[3].status,rpc:rpcAllowed?'autorizada; payload inválido rechazado':'denegada'});
 }
}
try {
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);const admin2=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);
 stage='regresión base';
 ok((await admin.authClient.auth.getUser()).data.user.id===admin.id&&(await member.authClient.auth.getUser()).data.user.id===member.id,'Auth real y dos perfiles activos');
 for(const who of [admin,member]){await go(who,'/dashboard');await expect(who.page.getByRole('heading',{level:1})).toBeVisible();ok(true,'Dashboard con sesión '+(who===admin?'Admin':'Colaborador'));}
 ok((await admin.client.from('settings').select('business_name').single()).data?.business_name==='caffi crochet','Configuración Admin conservada');
 ok(!(await member.client.from('settings').select('*')).data?.length,'Configuración financiera no se entrega a Colaborador');
 ok(!(await member.client.from('quote_products_read').select('*').limit(1)).error,'Catálogo comercial operativo');
 const priorFile=(await admin.client.from('order_files').select('id').limit(1)).data?.[0];if(!priorFile)throw Error('Falta referencia previa para regresión Storage');
 ok((await admin.context.request.get('http://localhost:3000/api/order-file/'+priorFile.id)).status()===200,'Storage previo: referencia de pedido autorizada');
 ok((await fetch('http://localhost:3000/api/order-file/'+priorFile.id)).status===401,'Storage previo: anónimo rechazado');
 const saved=await admin.client.rpc('save_expense_category',{target:categoryId,expected_revision:0,payload:{name:prefix,is_active:true}});ok(!saved.error,'Categoría de auditoría Admin');
 const base={category_id:categoryId,amount:'1.00',currency:'CRC',description:prefix};
 const own=await create(member.client,base),foreign=await create(admin.client,base);
 stage='concurrencia';
 const duplicate=randomUUID();ids.push(duplicate);const dup=await Promise.all([member.client,admin.client].map(client=>client.rpc('register_expense',{target:duplicate,payload:base})));
 ok(dup.filter(r=>!r.error).length===1&&dup.filter(r=>r.status===409).length===1,'Dos altas mismo UUID: una alta y un conflicto');
 const voidTarget=await create(admin.client,base);const annul=await Promise.all([admin.client,admin2.client].map(client=>client.rpc('void_expense',{target:voidTarget,expected_revision:1,reason:'Auditoría: dos anulaciones simultáneas'})));
 ok(annul.filter(r=>!r.error).length===1&&annul.filter(r=>r.status===409).length===1,'Dos anulaciones simultáneas: una y un conflicto');
 ok((await admin.client.from('audit_log').select('id').eq('entity_id',voidTarget).eq('action','expense.voided')).data.length===1,'Una sola auditoría de anulación concurrente');
 const historical=randomUUID();ids.push(historical);const historic={...base,currency:'USD',amount:'0.01',expense_date:'1802-01-01T12:00:00-06:00',historical_rate:'500.50000000000000001',rate_source:'BCCR via tipodecambio.paginasweb.cr',rate_reason:'Referencia manual declarada, no obtenida del proveedor'};
 const history=await Promise.all([admin.client,admin2.client].map((client,i)=>client.rpc('register_expense',{target:historical,payload:{...historic,historical_rate:i?'700.50000000000000001':historic.historical_rate}})));
 ok(history.filter(r=>!r.error).length===1&&history.filter(r=>r.status===409).length===1,'Dos aportes históricos mismo UUID no se pisan');
 const snap=await read(historical);ok(snap.rate_origin==='admin_historical'&&snap.rate_provided_by===admin.id&&!!snap.rate_provided_at&&snap.rate_override_reason===historic.rate_reason,'Origen manual inequívoco aunque referencia declare nombre del proveedor');
 ok(snap.amount_crc===(snap.exchange_rate_applied===historic.historical_rate?'5.01':'7.01'),'Snapshot ganador y HALF UP coherentes');
 const otherHistorical=await create(admin.client,{...historic,historical_rate:'600.1234567890123456789'});
 ok((await read(otherHistorical)).exchange_rate_applied==='600.1234567890123456789'&&(await read(historical)).exchange_rate_applied===snap.exchange_rate_applied,'Aporte manual se aplica a cada gasto; no sobrescribe otro ni la caché');
 const ownRow=await read(own);
 for(const key of ['amount','currency','amount_crc','exchange_rate_applied','exchange_rate_date','exchange_rate_source','rate_origin','category_id','expense_date','order_id','order_item_id','created_by','status','supplier','payment_method']){
  const r=await member.client.rpc('edit_expense_notes',{target:own,expected_revision:ownRow.revision,payload:{description:'Intento', [key]:null}});ok(r.error?.code==='22023','Mass assignment rechazado: '+key);
 }
 stage='comprobantes y fallos';
 const image=await sharp({create:{width:32,height:32,channels:3,background:'#DD0675'}}).png().toBuffer();
 await go(member,'/gastos/'+own);
 await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'mismatch.jpg',mimeType:'image/jpeg',buffer:image});await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();await expect(member.page.getByRole('alert').filter({hasText:'imagen real'})).toBeVisible();ok(true,'MIME JPEG declarado con bytes PNG rechazado realmente');
 const exact=Buffer.concat([image,Buffer.alloc(5*1024*1024-image.length)]);
 await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'maximum.png',mimeType:'image/png',buffer:exact});await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();
 await expect.poll(async()=>(await member.client.from('expense_files').select('id').eq('expense_id',own)).data?.length).toBe(1);ok(true,'Imagen válida exactamente 5 MiB admitida y recodificada');
 const file=(await member.client.from('expense_files').select('*').eq('expense_id',own)).data[0];ok(new RegExp('^expenses/'+own+'/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.webp$').test(file.path),'Ruta interna UUID estricta generada por servidor');
 const orphan='expenses/'+own+'/'+randomUUID()+'.webp';const bytes=await sharp(image).webp().toBuffer();const upload=await privileged.storage.from('expense-receipts').upload(orphan,bytes,{contentType:'image/webp',cacheControl:'0',upsert:false});if(upload.error)throw Error('No se pudo preparar fallo asociación');orphanPaths.push(orphan);
 const before=await read(own);const associated=await privileged.rpc('register_expense_file',{actor:member.id,target:own,expected_revision:before.revision-1,object_path:orphan,caption_text:'Fallo controlado',size_bytes:bytes.length});
 ok(associated.status===409,'Asociación fallida devuelve conflicto');
 ok((await read(own)).revision===before.revision&&(await member.client.from('expense_files').select('id').eq('path',orphan)).data.length===0,'Asociación fallida sin revisión ni metadatos parciales');
 ok(!!(await member.client.storage.from('expense-receipts').download(orphan)).error,'Objeto sin vínculo permanece inaccesible; sin borrado automático');
 ok(!!(await privileged.storage.from('expense-receipts').upload(orphan,bytes,{contentType:'image/webp',upsert:false})).error,'Ruta existente no se sobrescribe');
 stage='reclasificación administrativa';
 const destination=(await admin.client.from('expense_categories').select('id,name').eq('is_active',true).neq('id',categoryId).order('name').limit(1)).data[0];
 if(!destination)throw Error('Falta categoría aprobada de destino');
 const reclass=await create(member.client,{...base,description:prefix+' reclasificar'});
 const beforeReclass=await read(reclass);
 const reclassArgs={target:reclass,expected_revision:1,new_category:destination.id,reason:'Corrección administrativa de clasificación'};
 ok((await member.client.rpc('reclassify_expense',reclassArgs)).error?.code==='42501','Reclasificación Colaborador rechazada');
 ok((await anon.rpc('reclassify_expense',reclassArgs)).error?.code==='42501','Reclasificación anónima rechazada');
 for(const reason of ['',null,'   ','x'.repeat(1001)])ok((await admin.client.rpc('reclassify_expense',{...reclassArgs,reason})).error?.code==='22023','Motivo inválido rechazado');
 ok((await admin.client.rpc('reclassify_expense',{...reclassArgs,new_category:categoryId})).error?.code==='22023','Misma categoría rechazada');
 ok((await admin.client.rpc('reclassify_expense',{...reclassArgs,new_category:randomUUID()})).error?.code==='22023','Categoría inexistente rechazada');
 const raceReclass=await Promise.all([admin.client.rpc('reclassify_expense',reclassArgs),admin2.client.rpc('reclassify_expense',reclassArgs)]);
 ok(raceReclass.filter(r=>!r.error).length===1&&raceReclass.filter(r=>r.error?.code==='PT409').length===1,'Reclasificaciones concurrentes: un éxito y un conflicto');
 const afterReclass=await read(reclass);
 const stable=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k])=>!['category_id','revision','updated_by','updated_at'].includes(k))));
 ok(afterReclass.category_id===destination.id&&afterReclass.revision===2&&stable(beforeReclass)===stable(afterReclass),'Reclasificación conserva todos los datos originales');
 const reclassAudit=(await admin.client.from('audit_log').select('user_id,created_at,reason,metadata').eq('entity_id',reclass).eq('action','expense.category_changed')).data;
 ok(reclassAudit.length===1&&reclassAudit[0].user_id===admin.id&&!!reclassAudit[0].created_at&&reclassAudit[0].reason===reclassArgs.reason&&reclassAudit[0].metadata.before.category_id===categoryId&&reclassAudit[0].metadata.after.category_id===destination.id,'Auditoría específica before/after actor fecha motivo');
 ok((await admin.client.from('expenses').update({category_id:categoryId}).eq('id',reclass)).error?.code==='42501','UPDATE directo de categoría rechazado a Admin');
 ok((await member.client.from('expenses').update({category_id:categoryId}).eq('id',reclass)).error?.code==='42501','UPDATE directo de categoría rechazado a Colaborador');
 await go(member,'/gastos/'+reclass);ok(await member.page.getByRole('heading',{name:'Reclasificación administrativa'}).count()===0,'Colaborador sin formulario de reclasificación');
 await go(admin,'/gastos/'+reclass);await admin.page.getByLabel('Nueva categoría').selectOption(categoryId);await admin.page.getByLabel('Motivo de reclasificación').fill('Corrección desde interfaz de Administración');await admin.page.getByRole('button',{name:'Reclasificar gasto',exact:true}).click();await admin.page.getByRole('button',{name:'Reclasificar',exact:true}).click();await expect(admin.page.getByText('Categoría corregida; historial conservado')).toBeVisible();
 ok((await read(reclass)).category_id===categoryId,'Reclasificación real desde interfaz Admin');
 const historicBefore=await read(historical);
 ok(!(await admin.client.rpc('reclassify_expense',{target:historical,expected_revision:historicBefore.revision,new_category:destination.id,reason:'Clasificación de gasto USD histórico'})).error,'Reclasificación USD histórica autorizada');
 ok(stable(historicBefore)===stable(await read(historical)),'USD histórico conserva tasa fecha fuente y equivalente');
 const receiptBefore=await read(own);const filesBefore=(await admin.client.from('expense_files').select('*').eq('expense_id',own).order('id')).data;
 ok(!(await admin.client.rpc('reclassify_expense',{target:own,expected_revision:receiptBefore.revision,new_category:destination.id,reason:'Clasificación con comprobantes'})).error,'Reclasificación de gasto con comprobantes');
 ok(stable(receiptBefore)===stable(await read(own))&&JSON.stringify(filesBefore)===JSON.stringify((await admin.client.from('expense_files').select('*').eq('expense_id',own).order('id')).data),'Reclasificación conserva comprobantes y originales');
 ok(!(await admin.client.rpc('save_expense_category',{target:categoryId,expected_revision:categoryRevision,payload:{name:prefix,is_active:false}})).error,'Desactivar categoría propia de prueba');categoryRevision++;
 ok((await read(reclass)).category_id===categoryId,'Desactivar categoría no altera referencia histórica');
 ok((await admin.client.rpc('reclassify_expense',{target:own,expected_revision:(await read(own)).revision,new_category:categoryId,reason:'Destino inactivo'})).error?.code==='22023','Reclasificación a categoría inactiva rechazada');
 ok(!(await admin.client.rpc('save_expense_category',{target:categoryId,expected_revision:categoryRevision,payload:{name:prefix,is_active:true}})).error,'Restaurar categoría de prueba');categoryRevision++;
 ok(!(await admin.client.rpc('void_expense',{target:reclass,expected_revision:(await read(reclass)).revision,reason:'Cierre prueba reclasificación'})).error,'Anulación de fixture reclasificado');
 ok((await admin.client.rpc('reclassify_expense',{target:reclass,expected_revision:(await read(reclass)).revision,new_category:destination.id,reason:'Anulado'})).error?.code==='PT409','Gasto anulado no se reclasifica');
 stage='matriz JWT';const targets={expense_categories:categoryId,expenses:own,expense_files:file.id};
 await permissionMatrix(admin.client,'Admin',targets,true);await permissionMatrix(member.client,'Colaborador',targets,true);await permissionMatrix(anon,'Anónimo',targets,false);
 ok(!(await member.client.from('expenses_read').select('*').eq('id',foreign)).data.length,'UUID ajeno invisible con JWT real');
 ok(!(await member.client.from('audit_log').select('*').eq('entity_id',own)).data.length,'Auditoría general invisible a Colaborador');
 stage='responsive ambos roles';
 const usd=await create(member.client,{...base,currency:'USD',amount:'0.01'});
 for(const width of [320,375,768,1024,1440]){
  for(const who of [admin,member]){await who.page.setViewportSize({width,height:900});for(const id of [usd,own]){await go(who,'/gastos/'+id);ok(await who.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Responsive '+width+' '+(who===admin?'Admin':'Colaborador')+' '+(id===usd?'USD':'comprobantes'));const small=await who.page.locator('input:not([type="checkbox"]),textarea,select,button').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width>0).some(n=>n.getBoundingClientRect().height<43||parseFloat(getComputedStyle(n).fontSize)<16&&n.matches('input,select,textarea')));ok(!small,'Controles y fuentes '+width+' '+(who===admin?'Admin':'Colaborador'));}}
  await go(admin,'/gastos/'+own);await admin.page.getByRole('button',{name:'Anular gasto',exact:true}).click();await expect(admin.page.getByLabel('Motivo obligatorio')).toBeVisible();ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Motivo anulación sin overflow '+width);await admin.page.locator('.swal2-cancel').click();
  await admin.page.screenshot({path:'test-results/phase3d-audit-'+width+'.png',fullPage:true});
 }
 await go(admin,'/gastos/'+historical);await expect(admin.page.getByText('Origen: Aporte histórico manual de Administración')).toBeVisible();await expect(admin.page.getByText(/Referencia declarada por Admin:/)).toBeVisible();ok(true,'UI distingue origen manual de referencia declarada');
 const metadata=(await admin.client.from('audit_log').select('user_id,created_at,reason,metadata').eq('entity_id',historical).eq('action','expense.created')).data[0];ok(metadata.user_id===admin.id&&!!metadata.created_at&&metadata.reason===historic.rate_reason&&metadata.metadata.after.rate_provided_at,'Auditoría de tasa manual con actor/fecha/motivo');
 const fileLog=(await admin.client.from('audit_log').select('user_id,created_at,metadata').eq('entity_id',file.id).eq('action','expense.file_registered')).data[0];ok(fileLog.user_id===member.id&&!!fileLog.created_at&&fileLog.metadata.after.path===file.path,'Auditoría de archivo con actor/fecha/metadatos');
 const disabled=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(disabled.error)throw Error('Inactivación fallida');inactive=true;
 await permissionMatrix(member.client,'Inactivo',targets,false);
 ok((await member.client.rpc('reclassify_expense',reclassArgs)).error?.code==='42501','JWT inactivo no reclasifica');
 ok((await member.context.request.get('http://localhost:3000/api/expense-file/'+file.id)).status()===401,'Inactivo sin acceso a descarga con JWT abierto');
 const restored=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(restored.error)throw Error('Restauración fallida');inactive=false;
 stage='completado';
}catch(error){console.error('FAIL '+stage+': '+error.message);process.exitCode=1;if(member)await member.page.screenshot({path:'test-results/phase3d-audit-failure.png',fullPage:true}).catch(()=>{});}
finally{
 if(inactive&&admin&&member)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 if(admin){for(const id of [...new Set(ids)]){const r=await admin.client.from('expenses_read').select('status,revision').eq('id',id).maybeSingle();if(r.data?.status==='valid')await admin.client.rpc('void_expense',{target:id,expected_revision:r.data.revision,reason:'Cierre auditoría 3D; conservar evidencia'});}await admin.client.rpc('save_expense_category',{target:categoryId,expected_revision:categoryRevision,payload:{name:prefix,is_active:false}});}
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3d-audit-real-summary.json',JSON.stringify({stage,passed:evidence,matrix,records:ids,orphanPaths},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
