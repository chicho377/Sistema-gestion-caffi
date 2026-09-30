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
let admin,member,inactive=false,stage='inicio';const prefix='VERIFICACION-F3D-'+Date.now();
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
const go=async(who,path)=>{
 await who.page.goto('http://localhost:3000'+path);await who.page.waitForLoadState('networkidle');
 await expect(who.page.getByRole('heading',{name:'No pudimos cargar esta página'})).toHaveCount(0);
};
const read=async id=>{const r=await admin.client.from('expenses_read').select('*').eq('id',id).single();if(r.error)throw Error('Lectura falló '+r.error.code);return r.data;};
const register=(client,id,payload)=>client.rpc('register_expense',{target:id,payload});
const edit=(client,id,revision,payload)=>client.rpc('edit_expense_notes',{target:id,expected_revision:revision,payload});
const voided=(client,id,revision,reason)=>client.rpc('void_expense',{target:id,expected_revision:revision,reason});
const categoryId=randomUUID();let categoryRevision=1;
try {
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=(await admin.client.from('profiles').select('role,status').eq('id',admin.id).single()).data,m=(await member.client.from('profiles').select('role,status').eq('id',member.id).single()).data;
 ok(a?.role==='admin'&&a.status==='active'&&m?.role==='collaborator'&&m.status==='active','Perfiles vigentes');
 stage='categorías';
 const save=(who,target,revision,payload)=>who.rpc('save_expense_category',{target,expected_revision:revision,payload});
 ok(!(await save(admin.client,categoryId,0,{name:prefix,is_active:true})).error,'Admin crea categoría real');
 ok((await save(member.client,randomUUID(),0,{name:prefix+' prohibida',is_active:true})).error?.code==='42501','Colaborador no administra categorías');
 ok((await save(admin.client,randomUUID(),0,{name:'  '+prefix.toLowerCase()+'  ',is_active:true})).error?.code==='PT409','Categoría duplicada normalizada');
 ok(!(await save(admin.client,categoryId,1,{name:prefix,description:'Verificación real 3D',is_active:true})).error,'Admin edita categoría');categoryRevision=2;
 const id=randomUUID(),own=randomUUID(),historical=randomUUID();ids.push(id,own,historical);
 const payload={category_id:categoryId,amount:'10.25',currency:'CRC',description:prefix};
 stage='altas y moneda';
 ok(!(await register(admin.client,id,payload)).error,'Admin alta CRC');
 ok(!(await register(member.client,own,payload)).error,'Colaborador alta propia hoy');
 ok((await read(own)).created_by===member.id,'Autor desde sesión vigente');
 ok(!(await register(admin.client,historical,{...payload,amount:'0.01',currency:'USD',expense_date:'1902-01-01T12:00:00-06:00',historical_rate:'500.5000000000000000001',rate_source:'Referencia controlada de prueba',rate_reason:'Validación histórica faltante'})).error,'Admin aporta referencia histórica faltante');
 const snapshot=await read(historical);ok(snapshot.amount_crc==='5.01'&&snapshot.exchange_rate_applied==='500.5000000000000000001'&&snapshot.exchange_rate_date==='1902-01-01'&&snapshot.rate_provided_by===admin.id,'HALF UP, precisión completa y evidencia histórica');
 for(const amount of ['0','-1','1.001','NaN','Infinity','1e2'])ok((await register(member.client,randomUUID(),{...payload,amount})).error?.code==='22023','Monto rechazado '+amount);
 for(const extra of [{amount:1},{currency:'EUR'},{description:{}},{created_by:admin.id},{order_item_id:randomUUID()},{expense_date:'2099-01-01T12:00:00-06:00'}])ok((await register(member.client,randomUUID(),{...payload,...extra})).error?.code==='22023','Entrada no autorizada '+Object.keys(extra)[0]);
 ok((await register(member.client,randomUUID(),{...payload,expense_date:'1902-01-01T12:00:00-06:00'})).error?.code==='22023','Colaborador no registra históricos');
 ok((await register(member.client,randomUUID(),{...payload,currency:'USD',historical_rate:'1',rate_source:'Intento',rate_reason:'Intento'})).error?.code==='42501','Colaborador no aporta tasas');
 ok((await register(admin.client,randomUUID(),{...payload,currency:'USD',expense_date:'1902-01-02T12:00:00-06:00'})).error?.code==='22023','Histórico sin referencia bloqueado');
 ok((await register(admin.client,id,payload)).status===409,'UUID duplicado HTTP 409');
 stage='API/RLS';
 for(const [client,label,visible] of [[admin.client,'Admin',true],[member.client,'Colaborador ajeno',false],[anon,'Anon',false]]){
  for(const table of ['expenses','expenses_read']){const result=await client.from(table).select('*').eq('id',id);ok(visible?!result.error&&result.data.length===1:result.error?.code==='42501'||result.data?.length===0,label+' SELECT '+table);matrix.push({actor:label,table,rows:result.data?.length??0,error:result.error?.code});}
  for(const table of ['expenses','expense_files','expense_categories']){ok((await client.from(table).insert({id:randomUUID()})).error?.code==='42501',label+' INSERT directo '+table);ok((await client.from(table).update({id:randomUUID()}).eq('id',randomUUID())).error?.code==='42501',label+' UPDATE directo '+table);}
 }
 ok((await member.client.from('expenses_read').select('id').eq('id',own)).data?.length===1,'Colaborador lee propio');
 ok(!(await member.client.from('audit_log').select('id').eq('entity_id',own)).data?.length,'Sin auditoría general Colaborador');
 ok((await member.client.schema('private').rpc('register_expense',{target:randomUUID(),payload})).error?.code==='PGRST106','private fuera de Data API');
 ok((await edit(member.client,id,1,{description:'Ajeno'})).error?.code==='42501','No edita ajeno');
 ok((await edit(member.client,own,1,{description:'Propio',amount:'1'})).error?.code==='22023','No modifica finanzas por RPC notas');
 ok(!(await edit(member.client,own,1,{description:prefix+' propio editado',notes:'Permitidas'})).error,'Edita descripción y notas propias');
 ok((await edit(member.client,own,1,{description:'Viejo'})).status===409,'Revisión desactualizada HTTP 409');
 ok((await voided(member.client,own,2,'Intento')).error?.code==='42501','Colaborador no anula');
 stage='Storage e interfaz';
 await go(member,'/gastos/'+own);
 const image=await sharp({create:{width:30,height:30,channels:3,background:'#DD0675'}}).png().toBuffer();
 await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:image});
 await member.page.locator('form').filter({has:member.page.getByRole('heading',{name:'Agregar comprobante privado'})}).getByLabel('Descripción',{exact:true}).fill('Original real');
 await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();
 await expect.poll(async()=>(await member.client.from('expense_files').select('id').eq('expense_id',own)).data?.length).toBe(1);
 const originalFile=(await member.client.from('expense_files').select('*').eq('expense_id',own)).data[0];
 ok(!!originalFile&&originalFile.mime_type==='image/webp','Upload real validado y recodificado');
 ok(!!(await member.client.storage.from('expense-receipts').download(originalFile.path)).error,'JWT autor no descarga directamente Storage');
 const authorized=await member.context.request.get('http://localhost:3000/api/expense-file/'+originalFile.id);ok(authorized.status()===200&&authorized.headers()['cache-control'].includes('no-store'),'Autor descarga por proxy privado sin cache');
 ok(!!(await admin.client.storage.from('expense-receipts').download(originalFile.path)).error,'JWT Admin no descarga directamente Storage');
 ok((await admin.context.request.get('http://localhost:3000/api/expense-file/'+originalFile.id)).status()===200,'Admin descarga por proxy autorizado');
 ok(!!(await anon.storage.from('expense-receipts').download(originalFile.path)).error,'Anon no descarga Storage');
 const publicFile=await fetch(url+'/storage/v1/object/public/expense-receipts/'+originalFile.path);ok(!publicFile.ok,'Bucket no público');
 ok((await anon.rpc('register_expense_file',{actor:member.id,target:own,expected_revision:3,object_path:originalFile.path,caption_text:'Intento',size_bytes:10})).error?.code==='42501','RPC de archivos no accesible a anon');
 ok((await member.client.rpc('register_expense_file',{actor:member.id,target:own,expected_revision:3,object_path:originalFile.path,caption_text:'Intento',size_bytes:10})).error?.code==='42501','Colaborador no suplanta actor en infraestructura');
 await go(member,'/gastos/'+own);
 await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:image});
 await member.page.getByLabel('Versión que reemplaza').selectOption(originalFile.id);
 await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();await member.page.locator('.swal2-confirm').click();
 await expect.poll(async()=>(await member.client.from('expense_files').select('id').eq('expense_id',own)).data?.length).toBe(2);
 const versions=(await member.client.from('expense_files').select('*').eq('expense_id',own)).data;
 ok(versions.some(f=>f.id===originalFile.id&&!f.is_active)&&versions.some(f=>f.replaces_id===originalFile.id&&f.is_active),'Reemplazo preserva ambas versiones');
 ok((await member.context.request.get('http://localhost:3000/api/expense-file/'+originalFile.id)).status()===200,'Archivo anterior conservado por proxy autorizado');
 // Archivo de gasto ajeno para probar UUID/ruta conocida, sin confiar en ocultación UI.
 await go(admin,'/gastos/'+id);await admin.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'admin.png',mimeType:'image/png',buffer:image});await admin.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();
 await expect.poll(async()=>(await admin.client.from('expense_files').select('id').eq('expense_id',id)).data?.length).toBe(1);
 const foreign=(await admin.client.from('expense_files').select('*').eq('expense_id',id)).data[0];
 ok(!(await member.client.from('expense_files').select('*').eq('id',foreign.id)).data?.length,'Metadata ajena protegida');
 ok(!!(await member.client.storage.from('expense-receipts').download(foreign.path)).error,'Storage ajeno protegido');
 ok((await member.context.request.get('http://localhost:3000/api/expense-file/'+foreign.id)).status()===404,'API descarga ajena denegada');
 await go(member,'/gastos/'+own);await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<html>no imagen</html>')});await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();await expect(member.page.getByRole('alert').filter({hasText:'imagen real'})).toBeVisible();ok(true,'Rechazo bytes falsos en servidor');
 await member.page.getByLabel('Imagen',{exact:true}).setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});await member.page.getByRole('button',{name:'Guardar comprobante',exact:true}).click();await expect(member.page.getByRole('alert').filter({hasText:'hasta 5 MiB'})).toBeVisible();ok(true,'Archivo mayor a 5 MiB rechazado por servidor');
 ok((await member.client.from('expense_files').select('id').eq('expense_id',own)).data.length===2,'Archivos inválidos no crean metadatos');
 stage='responsive';
 for(const width of [320,375,768,1024,1440]){
  await admin.page.setViewportSize({width,height:900});await member.page.setViewportSize({width,height:900});
  for(const [who,path,label] of [[admin,'/gastos?q='+prefix,'Admin listado'],[member,'/gastos/'+own,'Colaborador detalle'],[member,'/gastos/nuevo','Colaborador alta'],[admin,'/gastos/'+historical,'Admin USD'],[admin,'/categorias-gastos?q='+prefix,'Categorías']]){
   await go(who,path);await expect(who.page.getByRole('heading',{level:1})).toBeVisible();
   ok(await who.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' sin overflow '+label);
   const small=await who.page.locator('button,input:not([type="checkbox"]),select,textarea,a.button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0).filter(n=>{const r=n.getBoundingClientRect();return r.width<43||r.height<43;}).length);
   ok(small===0,width+' controles táctiles '+label);
   await who.page.screenshot({path:'test-results/phase3d-'+width+'-'+label.replaceAll(' ','-')+'.png',fullPage:true});
  }
 }
 await go(member,'/gastos/'+id);ok(!(await member.page.content()).includes(prefix),'UI no entrega gasto ajeno');
 await go(member,'/categorias-gastos');await expect(member.page).toHaveURL(/dashboard\?notice=forbidden/);ok(true,'Ruta categorías solo Admin');
 await go(member,'/gastos?q=NO-EXISTE-'+prefix);await expect(member.page.getByRole('heading',{name:'Sin coincidencias'})).toBeVisible();ok(true,'Vacío real');
 stage='relaciones';
 const line=(await admin.client.from('order_items').select('id,order_id').limit(1)).data?.[0];
 if(!line)throw Error('Falta una línea existente para verificar relación real');
 const linked=randomUUID();ids.push(linked);ok(!(await register(member.client,linked,{...payload,order_id:line.order_id,order_item_id:line.id})).error,'Gasto vinculado a pedido y línea reales');
 const other=(await admin.client.from('orders').select('id').neq('id',line.order_id).limit(1)).data?.[0];if(!other)throw Error('Falta otro pedido para verificar relación inválida');
 ok((await register(member.client,randomUUID(),{...payload,order_id:other.id,order_item_id:line.id})).error?.code==='22023','Línea de otro pedido rechazada');
 stage='red y carga simuladas';await go(member,'/gastos/nuevo');await member.page.locator('select[name=category_id]').selectOption(categoryId);await member.page.getByLabel('Monto original').fill('0.01');await member.page.getByLabel('Descripción',{exact:true}).fill(prefix+' red');
 let release;const held=new Promise(resolve=>release=resolve);const fault=async route=>{if(route.request().method()==='POST'){await held;await route.abort('failed');}else await route.continue();};
 await member.page.route('**/gastos/nuevo',fault);await member.page.getByRole('button',{name:'Registrar gasto',exact:true}).click();await expect(member.page.locator('[aria-busy="true"]')).toBeVisible();await expect(member.page.getByRole('button',{name:'Guardando…'})).toBeDisabled();ok(true,'Carga simulada impide doble envío');release();await expect(member.page.getByRole('alert').filter({hasText:'No se pudo conectar'})).toBeFocused();await expect(member.page.getByLabel('Monto original')).toHaveValue('0.01');ok(true,'Error de red simulado conserva campos y enfoca mensaje');await member.page.unroute('**/gastos/nuevo',fault);
 await member.page.emulateMedia({reducedMotion:'reduce'});ok(await member.page.locator('main').evaluate(n=>getComputedStyle(n).animationName==='none'),'Reduced motion');
 stage='alta USD UI y tasa real';await go(member,'/gastos/nuevo');
 await member.page.locator('select[name=category_id]').selectOption(categoryId);await member.page.getByLabel('Moneda').selectOption('USD');await member.page.getByLabel('Monto original').fill('0.01');await member.page.getByLabel('Descripción',{exact:true}).fill(prefix+' USD UI');await member.page.getByRole('button',{name:'Consultar tasa aplicable'}).click();
 await expect(member.page.getByText(/Tasa de venta:/)).toBeVisible();ok(true,'Referencia real disponible para hoy o fallback');
 await member.page.getByRole('button',{name:'Registrar gasto',exact:true}).click();await expect(member.page).toHaveURL(/gastos\/[a-f0-9-]{36}$/);const uiId=member.page.url().split('/').at(-1);ids.push(uiId);const usd=await read(uiId);ok(usd.currency==='USD'&&!!usd.exchange_rate_applied&&!!usd.exchange_rate_date&&usd.created_by===member.id,'Alta USD UI conserva evidencia real');
 if(usd.rate_is_fallback){await expect(member.page.getByText(/Se utiliza automáticamente la última tasa válida guardada/)).toBeVisible();ok(true,'Fallback real muestra advertencia y fecha '+usd.exchange_rate_date);}
 stage='anulación e inactivo';const revision=(await read(own)).revision;
 const raced=await Promise.all([voided(admin.client,own,revision,'Prueba simultánea A'),edit(member.client,own,revision,{description:prefix+' concurrente'})]);ok(raced.filter(r=>!r.error).length===1&&raced.filter(r=>r.status===409).length===1,'Edición/anulación concurrentes sin pérdida silenciosa');
 const changed=await read(own);if(changed.status==='valid')ok(!(await voided(admin.client,own,changed.revision,'Cierre concurrente')).error,'Anulación posterior Admin');
 ok((await member.client.from('expense_files').select('id').eq('expense_id',own)).data.length===2,'Anular conserva comprobantes');
 ok((await read(historical)).exchange_rate_applied===snapshot.exchange_rate_applied,'Snapshot histórico permanece exacto');
 await go(admin,'/gastos/'+uiId);await admin.page.getByRole('button',{name:'Anular gasto',exact:true}).click();await admin.page.getByLabel('Motivo obligatorio').fill('Verificación UI 3D: conservar original');await admin.page.locator('.swal2-confirm').click();await expect.poll(async()=>(await read(uiId)).status).toBe('voided');ok(true,'Anulación UI real con motivo y SweetAlert2');
 ok((await voided(admin.client,uiId,(await read(uiId)).revision,'Segunda')).status===409,'Segunda anulación rechazada');
 const logs=(await admin.client.from('audit_log').select('action,metadata').eq('entity_type','expenses').eq('entity_id',own)).data;ok(logs.some(l=>l.action==='expense.created')&&logs.some(l=>l.action==='expense.voided'&&l.metadata.before&&l.metadata.after),'Auditoría real before/after');
 const disabled=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(disabled.error)throw Error('No se pudo inactivar');inactive=true;
 ok(!(await member.client.from('expenses_read').select('id').eq('id',own)).data?.length,'Inactivo JWT vigente cero gastos');ok(!!(await member.client.storage.from('expense-receipts').download(originalFile.path)).error,'Inactivo JWT vigente cero archivos');ok((await member.context.request.get('http://localhost:3000/api/expense-file/'+originalFile.id)).status()===401,'Inactivo proxy bloqueado inmediatamente');ok((await register(member.client,randomUUID(),payload)).error?.code==='42501','Inactivo no registra');
 await go(member,'/gastos');await expect(member.page).toHaveURL(/login/);ok(true,'Inactivo expulsado UI');
 const restored=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(restored.error)throw Error('No se pudo reactivar');inactive=false;
 await go(admin,'/categorias-gastos?edit='+categoryId);await admin.page.getByLabel('Activa',{exact:true}).uncheck();await admin.page.getByRole('button',{name:'Guardar categoría',exact:true}).click();await admin.page.locator('.swal2-confirm').click();await expect.poll(async()=>(await admin.client.from('expense_categories').select('is_active').eq('id',categoryId).single()).data?.is_active).toBe(false);ok(true,'Desactivación categoría UI conserva historia');categoryRevision++;
 ok((await register(admin.client,randomUUID(),payload)).error?.code==='22023','Categoría inactiva no admite altas');
 ok((await member.client.from('expense_categories').select('id').eq('id',categoryId)).data?.length===1,'Categoría histórica propia sigue consultable');
 stage='completado';
} catch(error){console.error('FAIL '+stage+': '+error.message);if(member)await member.page.screenshot({path:'test-results/phase3d-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally {
 if(inactive&&admin&&member)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 if(admin){for(const id of ids){const row=await admin.client.from('expenses_read').select('status,revision').eq('id',id).maybeSingle();if(row.data?.status==='valid')await voided(admin.client,id,row.data.revision,'Cierre verificación F3D; conservar registro');}
  await admin.client.rpc('save_expense_category',{target:categoryId,expected_revision:categoryRevision,payload:{name:prefix,is_active:false}});
 }
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3d-real-summary.json',JSON.stringify({stage,passed:evidence,matrix,records:ids},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
