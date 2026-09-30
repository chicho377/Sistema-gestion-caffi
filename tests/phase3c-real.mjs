import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const expect=baseExpect.configure({timeout:30000});
if(process.env.SIGCA_REAL_TESTS!=='1')throw Error('Requiere SIGCA_REAL_TESTS=1');
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(url!=='https://pysgfnwsycgoneaecgcl.supabase.co')throw Error('Proyecto incorrecto');
const privileged=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch(),sessions=[],evidence=[],matrix=[],ids=[];
let admin,member,inactive=false,stage='inicio';const prefix='VERIFICACION-F3C-'+Date.now();
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
const go=async(who,path)=>{await who.page.goto('http://localhost:3000'+path);await who.page.waitForLoadState('networkidle');};
const read=async id=>{const r=await admin.client.from('manual_income_read').select('*').eq('id',id).single();if(r.error)throw Error('Lectura falló '+r.error.code);return r.data;};
const register=(client,id,payload)=>client.rpc('register_manual_income',{target:id,payload});
const voided=(client,id,reason)=>client.rpc('void_manual_income',{target:id,reason});
async function access(client,actor,allowed,id){
 for(const table of ['manual_income','manual_income_read']){
  const r=await client.from(table).select('*').eq('id',id);ok(allowed?!r.error&&r.data.length===1:(!r.error&&r.data.length===0)||r.error?.code==='42501',actor+' SELECT '+table+' UUID conocido');
  const row={actor,table,SELECT:r.error?.code??(allowed?'1 fila':'0 filas')};
  const absent=randomUUID();
  for(const [op,request] of Object.entries({INSERT:()=>client.from(table).insert({id:absent}),UPDATE:()=>client.from(table).update({amount:'0.01'}).eq('id',absent),DELETE:()=>client.from(table).delete().eq('id',absent)})){
   const result=await request();ok(result.error?.code==='42501'||(table==='manual_income_read'&&op==='UPDATE'&&result.error?.code==='0A000'),actor+' '+op+' '+table+' bloqueado ('+(result.error?.code??'sin error')+')');row[op]=result.error.code;
  }
  matrix.push(row);
 }
 if(!allowed){ok((await register(client,randomUUID(),{amount:'1'})).error?.code==='42501',actor+' RPC alta denegada');ok((await voided(client,id,'No autorizado')).error?.code==='42501',actor+' RPC anular denegada');}
}
try{
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=(await admin.client.from('profiles').select('role,status').eq('id',admin.id).single()).data,m=(await member.client.from('profiles').select('role,status').eq('id',member.id).single()).data;
 ok(a?.role==='admin'&&a.status==='active'&&m?.role==='collaborator'&&m.status==='active','Perfiles vigentes Admin/Colaborador');
 stage='alta y validaciones';const id=randomUUID();ids.push(id);
 const payload={amount:'10.25',currency:'CRC',income_date:'2020-01-02T23:50:00-06:00',income_type:'cards',payment_method:'sinpe_movil',description:prefix};
 ok(!(await register(admin.client,id,payload)).error,'Admin alta histórica real');
 const original=await read(id);ok(original.amount==='10.25'&&original.currency==='CRC'&&original.created_by===admin.id&&original.is_historical&&new Date(original.created_at)>new Date(original.income_date),'Monto exacto, actor y creación real separados de fecha histórica');
 for(const amount of ['0','-1','1.001','NaN','Infinity','1e2'])ok((await register(admin.client,randomUUID(),{amount})).error?.code==='22023','Monto rechazado '+amount);
 for(const extra of [{currency:'USD'},{income_date:'2099-01-01T00:00:00-06:00'},{income_type:'adelanto'},{payment_method:'falso'},{created_by:member.id},{created_at:'2000-01-01'},{order_id:randomUUID()},{payment_id:randomUUID()},{description:{}},{amount:1}])ok((await register(admin.client,randomUUID(),{amount:'1',...extra})).error?.code==='22023','Entrada no autorizada: '+Object.keys(extra)[0]);
 const duplicate=await register(admin.client,id,payload);ok(duplicate.status===409&&duplicate.error?.code==='PT409','Reintento del mismo UUID HTTP 409 sin duplicar');
 await access(admin.client,'Admin',true,id);await access(member.client,'Colaborador',false,id);await access(anon,'Anónimo',false,id);
 ok(!(await member.client.from('audit_log').select('*').eq('entity_id',id)).data?.length,'Colaborador no lee auditoría del ingreso');
 const priv=await member.client.schema('private').rpc('register_manual_income',{target:randomUUID(),payload:{amount:'1'}});ok(priv.error?.code==='PGRST106','private fuera de Data API');
 stage='navegación y responsive';
 for(const width of [320,375,768,1024,1440]){
  await admin.page.setViewportSize({width,height:900});await member.page.setViewportSize({width,height:900});
  for(const path of ['/ingresos-manuales?q='+prefix,'/ingresos-manuales/nuevo','/ingresos-manuales/'+id]){
   await go(admin,path);await expect(admin.page.getByRole('heading',{level:1})).toBeVisible();
   ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' sin overflow '+path.split('?')[0]);
   const small=await admin.page.locator('button,input,select,textarea,a.button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0).filter(n=>{const r=n.getBoundingClientRect();return r.width<43||r.height<43;}).length);
   ok(small===0,width+' controles táctiles '+path.split('?')[0]);
   await admin.page.screenshot({path:'test-results/phase3c-'+width+'-'+(path.includes('nuevo')?'new':path.includes('?')?'list':'detail')+'.png',fullPage:true});
  }
  await go(member,'/mas');ok(await member.page.getByRole('link',{name:'Ingresos manuales',exact:true}).count()===0,width+' Colaborador sin módulo');
  await go(member,'/ingresos-manuales/'+id);await expect(member.page).toHaveURL(/dashboard\?notice=forbidden/);ok(!(await member.page.content()).includes(prefix),width+' Colaborador sin datos en RSC/HTML');
 }
 await admin.page.emulateMedia({reducedMotion:'reduce'});await go(admin,'/ingresos-manuales/'+id);ok(await admin.page.locator('main').evaluate(n=>getComputedStyle(n).animationName==='none'),'Reduced motion');
 stage='vacío y error de red';await go(admin,'/ingresos-manuales?q=NO-EXISTE-'+prefix);await expect(admin.page.getByRole('heading',{name:'Sin coincidencias'})).toBeVisible();ok(true,'Estado vacío real por búsqueda');
 await go(admin,'/ingresos-manuales/nuevo');await admin.page.getByLabel('Monto en colones').fill('3.20');await admin.page.getByLabel('Descripción (opcional)').fill(prefix+' UI');
 let release;const held=new Promise(resolve=>release=resolve);const fault=async route=>{if(route.request().method()==='POST'){await held;await route.abort('failed');}else await route.continue();};
 await admin.page.route('**/ingresos-manuales/nuevo',fault);await admin.page.getByRole('button',{name:'Registrar ingreso',exact:true}).click();await expect(admin.page.locator('[aria-busy="true"]')).toBeVisible();await expect(admin.page.getByRole('button',{name:'Guardando…'})).toBeDisabled();ok(true,'Carga bloquea envío duplicado');release();
 await expect(admin.page.getByRole('alert').filter({hasText:'No se pudo conectar'})).toBeFocused();await expect(admin.page.getByLabel('Monto en colones')).toHaveValue('3.20');ok(true,'Fallo de red simulado enfoca error y conserva datos');await admin.page.unroute('**/ingresos-manuales/nuevo',fault);
 stage='alta UI';await admin.page.getByRole('button',{name:'Registrar ingreso',exact:true}).click();await expect(admin.page).toHaveURL(/ingresos-manuales\/[a-f0-9-]{36}$/);const uiId=admin.page.url().split('/').at(-1);ids.push(uiId);ok((await read(uiId)).amount==='3.20','Alta UI persistida en Supabase real');
 stage='anulación';ok((await voided(admin.client,id,' ')).error?.code==='22023','Motivo vacío rechazado');
 await admin.page.getByRole('button',{name:'Anular ingreso',exact:true}).click();await admin.page.getByLabel('Motivo obligatorio').fill('Verificación F3C: corrección');await admin.page.locator('.swal2-confirm').click();await expect.poll(async()=>(await read(uiId)).status).toBe('voided');await expect(admin.page.locator('.swal2-container')).toHaveCount(0);ok(true,'Anulación UI real, motivo y SweetAlert2');
 const secondAdmin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);
 const race=await Promise.all([voided(admin.client,id,'Prueba concurrente A'),voided(secondAdmin.client,id,'Prueba concurrente B')]);ok(race.filter(r=>!r.error).length===1&&race.filter(r=>r.error?.code==='PT409'&&r.status===409).length===1,'Dos anulaciones simultáneas: un éxito y un HTTP 409');
 const after=await read(id);for(const field of ['id','amount','currency','income_date','income_type','payment_method','description','is_historical','created_by','created_at'])ok(after[field]===original[field],'Original conservado '+field);
 ok(after.voided_by===admin.id&&!!after.void_reason&&!!after.voided_at,'Actor/fecha/motivo de anulación');
 ok((await voided(admin.client,id,'Segunda')).error?.code==='PT409','Segunda anulación rechazada');
 ok((await admin.client.from('manual_income_read').select('id').eq('id',id).eq('status','valid')).data.length===0,'Anulado excluido de proyección válida');
 const logs=(await admin.client.from('audit_log').select('action,user_id,reason,metadata').eq('entity_type','manual_income').eq('entity_id',id)).data;
 ok(logs.length===2&&logs.some(l=>l.action==='manual_income.created')&&logs.some(l=>l.action==='manual_income.voided'&&l.reason&&l.metadata.before.amount===10.25&&l.metadata.after.status==='voided'),'Auditoría atómica con before/after y actor');
 stage='inactivo';const disabled=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(disabled.error)throw Error('No se pudo inactivar fixture');inactive=true;
 await access(member.client,'Inactivo JWT vigente',false,id);await go(member,'/ingresos-manuales');await expect(member.page).toHaveURL(/login/);ok(true,'Inactivo pierde acceso UI con JWT aún vigente');
 const restored=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(restored.error)throw Error('No se pudo reactivar fixture');inactive=false;
 stage='completado';
}catch(error){console.error('FAIL '+stage+': '+error.message);process.exitCode=1;}
finally{
 if(inactive&&admin&&member)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 if(admin)for(const id of ids){const r=await admin.client.from('manual_income_read').select('status').eq('id',id).maybeSingle();if(r.data?.status==='valid')await voided(admin.client,id,'Cierre de verificación F3C; conservar registro');}
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3c-real-summary.json',JSON.stringify({stage,passed:evidence,matrix,records:ids},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
