// Opt-in DEV: sesiones solo en memoria, datos etiquetados conservados/cancelados. Nunca borra usuarios ni filas.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { cents } from "../src/features/orders/domain.ts";
if(process.env.SIGCA_REAL_TESTS!=="1") throw Error("Requiere SIGCA_REAL_TESTS=1");
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(url!=="https://pysgfnwsycgoneaecgcl.supabase.co") throw Error('Proyecto incorrecto');
const privileged=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch();const sessions=[];const evidence=[];let stage='inicio',admin,member,inactive=false;
const prefix='VERIFICACION-F3B-'+Date.now();let clientId,orderId;const createdOrders=[];
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
const go=async(who,path)=>{stage=path;await who.page.goto('http://localhost:3000'+path);await who.page.waitForLoadState('networkidle');};
const header=async(id)=>{const {data,error}=await admin.client.from('quotes_read').select('*').eq('id',id).single();if(error)throw Error('No se pudo leer cotización');return data;};
async function payload(id){const o=await header(id);const {data:rows}=await admin.client.from('quote_items_read').select('*').eq('order_id',id).order('created_at');return {client_id:o.client_id,order_date:o.order_date,requested_delivery_date:o.requested_delivery_date,notes:o.notes,discount_amount:o.discount_amount,items:rows.map(r=>({id:r.id,product_id:r.product_id,product_name_snapshot:r.product_name_snapshot,description_snapshot:r.description_snapshot,quantity:String(r.quantity),unit_price:r.unit_price,discount_amount:r.discount_amount,customization:r.customization,notes:r.notes,is_active:r.is_active}))};}

async function call(who,operation,id,doc={},revision) { return who.client.rpc(operation,{target:id,expected_revision:revision??(await header(id)).revision,payload:doc}); }
async function pass(who,operation,id,doc={}) {const r=await call(who,operation,id,doc);if(r.error)throw Error(operation+' '+r.error.code+' '+r.error.message);return r.data;}
async function quote(amount='10',day) {
 const {businessDate}=await import('../src/features/orders/domain.ts');const id=randomUUID();
 const r=await admin.client.rpc('save_quote',{target:id,expected_revision:0,payload:{client_id:clientId,order_date:day??businessDate(),requested_delivery_date:day??businessDate(),discount_amount:'0',notes:prefix,items:[{id:randomUUID(),product_name_snapshot:prefix,quantity:'1',unit_price:amount,discount_amount:'0',is_active:true}]}});
 if(r.error)throw Error('Crear fixture '+r.error.code);createdOrders.push(id);return id;
}
async function race(label,operations){const r=await Promise.all(operations.map(f=>f()));ok(r.filter(r=>!r.error).length===1&&r.filter(r=>r.error?.code==='PT409'&&r.status===409).length===1,label+' → un éxito y un HTTP 409');}
const summary=async id=>(await admin.client.from('order_payment_summary').select('*').eq('order_id',id).single()).data;
const modal=async who=>who.page.locator('.swal2-confirm').click();
try {
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const a=(await admin.client.from('profiles').select('role,status').eq('id',admin.id).single()).data,m=(await member.client.from('profiles').select('role,status').eq('id',member.id).single()).data;
 ok(a?.role==='admin'&&m?.role==='collaborator'&&a.status==='active'&&m.status==='active','Sesiones independientes Admin/Colaborador vigentes');
 const c=await admin.client.from('clients').insert({name:prefix,phone:'83639663'}).select('id').single();if(c.error)throw Error('Cliente fixture');clientId=c.data.id;
 stage='concurrencia';
 const ids=await Promise.all([quote(),quote()]);
 const confirmations=await Promise.all([call(admin,'confirm_order',ids[0]),call(member,'confirm_order',ids[1])]);
 ok(confirmations.every(r=>!r.error),'Dos confirmaciones simultáneas en sesiones distintas');
 const numbers=await Promise.all(ids.map(header));
 ok(new Set(numbers.map(o=>o.order_number)).size===2&&Math.abs(numbers[0].number_sequence-numbers[1].number_sequence)===1,'Consecutivos atómicos distintos y contiguos');
 let id=ids[0],o=await header(id);
 await race('Dos pagos simultáneos contra el mismo saldo',[()=>call(admin,'register_payment',id,{amount:'7',payment_method:'cash'},o.revision),()=>call(member,'register_payment',id,{amount:'7',payment_method:'cash'},o.revision)]);
 ok(cents((await summary(id)).paid)===700n,'Nunca sobrepago: saldo final 3.00');
 id=await quote();o=await header(id);let doc=await payload(id);
 await race('Edición y confirmación simultáneas',[()=>admin.client.rpc('save_quote',{target:id,expected_revision:o.revision,payload:{...doc,notes:prefix+' edición'}}),()=>call(member,'confirm_order',id,{},o.revision)]);
 if((await header(id)).production_status==='quote')await pass(admin,'confirm_order',id);
 await pass(admin,'register_payment',id,{amount:'5',payment_method:'cash'});o=await header(id);
 await race('Transiciones simultáneas',[()=>call(admin,'transition_order',id,{state:'in_production'},o.revision),()=>call(member,'transition_order',id,{state:'in_production'},o.revision)]);
 id=await quote();await pass(admin,'confirm_order',id);o=await header(id);doc=await payload(id);doc.items[0].unit_price='3';
 await race('Pago y reducción de total simultáneos',[()=>call(member,'register_payment',id,{amount:'7',payment_method:'cash'},o.revision),()=>call(admin,'amend_order',id,doc,o.revision)]);
 let financial=await summary(id);ok(cents(financial.paid)<=cents(financial.total),'Pago/edición conserva pagos <= total');
 id=await quote();await pass(admin,'confirm_order',id);const payment=await pass(member,'register_payment',id,{amount:'5',payment_method:'cash'});o=await header(id);
 await race('Anulación y nuevo pago simultáneos',[()=>call(admin,'void_payment',id,{payment_id:payment,reason:'Prueba concurrente'},o.revision),()=>call(member,'register_payment',id,{amount:'5',payment_method:'cash'},o.revision)]);
 financial=await summary(id);ok(cents(financial.paid)<=cents(financial.total),'Anulación/pago conserva integridad');
 stage='permisos y validaciones';
 orderId=await quote('1');
 ok(!!(await call(member,'register_payment',orderId,{amount:'1',payment_method:'cash'})).error,'No pagos en Cotización');
 ok(!!(await call(member,'confirm_order',orderId,{deposit_percentage:'12.50'})).error,'Colaborador no fija porcentaje especial');
 ok(!!(await call(admin,'confirm_order',orderId,{deposit_percentage:'12.501'})).error,'Porcentaje mayor a dos decimales rechazado');
 await go(admin,'/pedidos/'+orderId);await admin.page.getByLabel('Porcentaje especial (opcional)',{exact:true}).fill('12.50');await admin.page.getByRole('button',{name:'Confirmar pedido',exact:true}).click();await modal(admin);await expect.poll(async()=>(await header(orderId)).production_status).toBe('confirmed');ok(true,'UI Admin confirma con adelanto especial');
 ok(cents((await header(orderId)).deposit_required_amount)===13n,'ROUND HALF UP real: 1.00 × 12.50% = 0.13');
 for(const amount of ['0','-1','0.001','2'])ok(!!(await call(member,'register_payment',orderId,{amount,payment_method:'cash'})).error,'Pago rechazado monto '+amount);
 const before=await header(orderId);ok(!!(await call(member,'transition_order',orderId,{state:'in_production'})).error,'Producción bloqueada sin adelanto');
 ok((await header(orderId)).revision===before.revision,'Errores revierten revisión sin escritura parcial');
 const zero=await quote('0');ok(!!(await call(member,'confirm_order',zero,{zero_reason:'Regalo'})).error,'Cero Colaborador rechazado');ok(!!(await call(admin,'confirm_order',zero)).error,'Cero sin motivo rechazado');await pass(admin,'confirm_order',zero,{zero_reason:'Verificación autorizada'});
 ok((await summary(zero)).financial_status==='paid'&&cents((await summary(zero)).paid)===0n,'Cero Admin pagado sin pago ficticio');
 for(const table of ['orders','payments','order_counters'])ok(!!(await member.client.from(table).update(table==='payments'?{amount:0}:table==='orders'?{total:0}:{last_sequence:0}).eq(table==='order_counters'?'year':'id',table==='order_counters'?2026:orderId)).error,'Sin UPDATE directo '+table);
 ok(!(await member.client.from('audit_log').select('id')).data?.length,'Colaborador no recibe auditoría general');
 ok(!!(await anon.from('payments').select('id')).error,'Anon sin pagos');
 for(const op of ['confirm_order','register_payment','void_payment','transition_order','amend_order','correct_order_dates'])ok(!!(await anon.rpc(op,{target:orderId,expected_revision:1,payload:{}})).error,'Anon bloqueado '+op);
 ok((await member.client.schema('private').rpc('confirm_order',{})).error?.code==='PGRST106','Private fuera de Data API');
 stage='UI real';await go(member,'/pedidos/'+orderId);
 await expect(member.page.getByRole('heading',{name:'Importes del pedido'})).toBeVisible();
 await member.page.getByLabel('Monto CRC',{exact:true}).fill('0.13');await member.page.getByRole('button',{name:'Registrar pago',exact:true}).click();await modal(member);
 await expect.poll(async()=>cents((await summary(orderId)).paid)).toBe(13n);
 await go(member,'/pedidos/'+orderId);await expect(member.page.getByRole('button',{name:'Anular pago',exact:true})).toHaveCount(0);
 for(const name of ['En producción','Listo','Entregado']){await member.page.getByRole('button',{name,exact:true}).click();await modal(member);await expect.poll(async()=> (await header(orderId)).production_status).toBe({'En producción':'in_production',Listo:'ready',Entregado:'delivered'}[name]);await go(member,'/pedidos/'+orderId);}
 ok(!!(await header(orderId)).delivered_at&&cents((await summary(orderId)).balance)===87n,'UI real: producción, listo y entrega con saldo pendiente');
 await member.page.getByLabel('Monto CRC',{exact:true}).fill('0.87');await member.page.getByRole('button',{name:'Registrar pago',exact:true}).click();await modal(member);await expect.poll(async()=> (await summary(orderId)).financial_status).toBe('paid');
 ok(true,'UI real: cobro después de Entregado');
 let pay=(await admin.client.from('payments_read').select('*').eq('order_id',orderId).order('created_at')).data;
 ok(!!(await call(member,'void_payment',orderId,{payment_id:pay[0].id,reason:'No permitido'})).error,'Colaborador no anula por API');
 ok(!!(await call(admin,'transition_order',orderId,{state:'cancelled',reason:'Directo prohibido'})).error,'Entregado no cancela directamente');
 await go(admin,'/pedidos/'+orderId);await admin.page.locator('tr').filter({has:admin.page.getByText('₡0,13',{exact:true})}).getByRole('button',{name:'Anular pago',exact:true}).click();await admin.page.getByLabel('Motivo obligatorio',{exact:true}).fill('Anulación de verificación');await modal(admin);await expect.poll(async()=>cents((await summary(orderId)).balance)).toBe(13n);
 ok(true,'UI Admin anula y recalcula saldo');
 await go(admin,'/pedidos/'+orderId);await admin.page.getByRole('button',{name:'Volver a Listo',exact:true}).click();await admin.page.getByLabel('Motivo obligatorio',{exact:true}).fill('Reapertura de verificación');await modal(admin);await expect.poll(async()=>(await header(orderId)).production_status).toBe('ready');ok((await header(orderId)).delivered_at===null,'UI reapertura limpia entrega vigente');
 await pass(member,'transition_order',orderId,{state:'delivered'});ok(!!(await header(orderId)).delivered_at,'Reentrega registra nueva fecha');
 await pass(admin,'transition_order',orderId,{state:'ready',reason:'Reapertura para prueba'});
 stage='responsive';
 for(const who of [admin,member])for(const width of [320,375,768,1024,1440]){
  await who.page.setViewportSize({width,height:950});await go(who,'/pedidos/'+orderId);
  ok(await who.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin scroll horizontal '+(who===admin?'Admin':'Colaborador')+' '+width);
  if(width<768)ok(await who.page.locator('.catalog-table tbody tr').first().evaluate(e=>getComputedStyle(e).display)!=='table-row','Pagos en tarjetas móvil '+width);
  await who.page.screenshot({path:`test-results/phase3b-real-${who===admin?'admin':'member'}-${width}.png`,fullPage:true});
 }
 stage='conflicto y red UI';await go(member,'/pedidos/'+orderId);await member.page.getByLabel('Monto CRC',{exact:true}).fill('0.13');
 await pass(admin,'amend_order',orderId,{...await payload(orderId),notes:prefix+' segunda sesión'});
 await member.page.getByRole('button',{name:'Registrar pago',exact:true}).click();await modal(member);await expect(member.page.getByRole('alert').filter({hasText:'pedido cambió'})).toBeVisible();await expect(member.page.getByLabel('Monto CRC',{exact:true})).toHaveValue('0.13');ok(true,'409 UI conserva importe del formulario obsoleto');
 await go(member,'/pedidos/'+orderId);await member.page.getByLabel('Monto CRC',{exact:true}).fill('0.13');
 const fault=async route=>route.request().method()==='POST'?route.abort('failed'):route.continue();await member.page.route('**/pedidos/'+orderId,fault);
 await member.page.getByRole('button',{name:'Registrar pago',exact:true}).click();await modal(member);await expect(member.page.getByRole('alert').filter({hasText:'No se pudo conectar'})).toBeVisible();await member.page.unroute('**/pedidos/'+orderId,fault);ok(true,'Fallo de red inducido: formulario conservado');
 stage='inactivo';await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);inactive=true;
 ok(!(await member.client.from('payments').select('id')).data?.length,'JWT vigente inactivo sin lectura de pagos');
 for(const op of ['confirm_order','register_payment','void_payment','transition_order','amend_order','correct_order_dates'])ok(!!(await call(member,op,orderId,{})).error,'Inactivo bloqueado '+op);
 await go(member,'/pedidos/'+orderId);await expect(member.page).toHaveURL(/login/);ok(true,'UI retira acceso al verificar perfil inactivo');
 await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);inactive=false;
 await pass(admin,'transition_order',orderId,{state:'cancelled',reason:'Cierre prueba real'});
 ok((await admin.client.from('payments').select('id').eq('order_id',orderId)).data.length===2,'Cancelación conserva pagos válidos y anulados');
 ok(!!(await call(member,'register_payment',orderId,{amount:'0.13',payment_method:'cash'})).error,'Cancelado no admite pagos');ok(!!(await call(admin,'transition_order',orderId,{state:'confirmed'})).error,'Cancelado terminal');
 const logs=(await admin.client.from('audit_log').select('action').eq('entity_id',orderId)).data;
 for(const action of ['order.confirmed','order.payment_recorded','order.payment_voided','order.delivered','order.reopened','order.cancelled'])ok(logs.some(l=>l.action===action),'Auditoría real '+action);
 stage='completado';
} catch(error){console.error('FAIL etapa '+stage+': '+error.message);process.exitCode=1;}
finally{
 if(inactive&&admin&&member)await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);
 if(admin){for(const id of createdOrders){let o=await header(id);if(o.production_status==='delivered'){await pass(admin,'transition_order',id,{state:'ready',reason:'Cierre fixture 3B'});o=await header(id);}if(o.production_status!=='cancelled')await pass(admin,'transition_order',id,{state:'cancelled',reason:'Cierre de verificación F3B; conservar historia'});}if(clientId)await admin.client.from('clients').update({is_active:false}).eq('id',clientId);}
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3b-real-summary.json',JSON.stringify({stage,passed:evidence,records:{clientId,orders:createdOrders}},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
