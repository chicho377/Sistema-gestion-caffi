import { cents } from '../src/features/orders/domain.ts';
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
let admin,member,stage='inicio';const prefix='REGRESION-F3D-'+Date.now();
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
let clientId;const incomeId=randomUUID();
async function row(table,id){const r=await admin.client.from(table).select('*').eq('id',id).single();if(r.error)throw Error('Lectura '+table+' '+r.error.code);return r.data;}
async function operation(who,name,id,payload={}){const o=await row('quotes_read',id);return who.rpc(name,{target:id,expected_revision:o.revision,payload});}
async function done(who,name,id,payload={}){const r=await operation(who,name,id,payload);if(r.error)throw Error(name+' '+r.error.code);return r.data;}
try {
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 stage='pedidos y consecutivos';
 const created=await admin.client.from('clients').insert({name:prefix,phone:'83639663'}).select('id').single();if(created.error)throw Error('Cliente fixture');clientId=created.data.id;
 const {businessDate}=await import('../src/features/orders/domain.ts');
 for(let i=0;i<2;i++){const id=randomUUID();ids.push(id);const r=await admin.client.rpc('save_quote',{target:id,expected_revision:0,payload:{client_id:clientId,order_date:businessDate(),requested_delivery_date:businessDate(),discount_amount:'0',notes:prefix,items:[{id:randomUUID(),product_name_snapshot:prefix,quantity:'1',unit_price:'25',discount_amount:'0',is_active:true}]}});ok(!r.error,'Cotización real '+(i+1));}
 const confirmed=await Promise.all(ids.map((id,i)=>operation(i?member.client:admin.client,'confirm_order',id)));
 ok(confirmed.every(r=>!r.error),'Confirmaciones concurrentes Admin/Colaborador');
 const orders=await Promise.all(ids.map(id=>row('quotes_read',id)));
 ok(new Set(orders.map(o=>o.order_number)).size===2&&orders.every(o=>/^PED-\d{4}-\d{5,}$/.test(o.order_number)),'Consecutivos anuales únicos conservados');
 ok(orders.every(o=>o.production_status==='confirmed'&&o.deposit_required_amount!==null),'Estado y adelanto histórico fijados');
 const id=ids[0],revision=orders[0].revision;
 stage='pagos y saldo';
 const payments=await Promise.all([admin.client,member.client].map(client=>client.rpc('register_payment',{target:id,expected_revision:revision,payload:{amount:'20',payment_method:'cash',notes:prefix}})));
 ok(payments.filter(r=>!r.error).length===1&&payments.filter(r=>r.status===409).length===1,'Dos pagos concurrentes: uno se registra y otro entra en conflicto');
 const totals=async()=>{const r=await admin.client.from('order_payment_summary').select('*').eq('order_id',id).single();if(r.error)throw Error('Saldo');return r.data;};
 let financial=await totals();ok(cents(financial.paid)===2000n&&cents(financial.balance)===500n&&financial.financial_status==='partially_paid','Saldo y estado financiero derivados');
 const payment=await done(member.client,'register_payment',id,{amount:'5',payment_method:'cash',notes:prefix});financial=await totals();ok(cents(financial.balance)===0n&&financial.financial_status==='paid','Cobro completa saldo');
 for(const state of ['in_production','ready','delivered']){await done(member.client,'transition_order',id,{state});ok((await row('quotes_read',id)).production_status===state,'Ciclo vigente '+state);}
 await done(admin.client,'void_payment',id,{payment_id:payment,reason:'Regresión 3D: corrección trazable'});ok(cents((await totals()).balance)===500n,'Anulación recalcula saldo sin editar pagos');
 await done(member.client,'register_payment',id,{amount:'5',payment_method:'cash',notes:prefix});ok(cents((await totals()).balance)===0n,'Cobro después de entregado sin reapertura');
 ok(!!(await operation(member.client,'register_payment',id,{amount:'1',payment_method:'cash'})).error,'Sobrepago bloqueado');
 ok((await member.client.from('order_counters').select('*')).error?.code==='42501','Contador sigue aislado');
 ok((await anon.from('payments').select('id')).error?.code==='42501','Pagos sin acceso anónimo');
 stage='ingresos manuales';
 const register=await admin.client.rpc('register_manual_income',{target:incomeId,payload:{amount:'13.17',currency:'CRC',income_type:'cards',income_date:'2020-01-01T12:00:00-06:00',description:prefix}});ok(!register.error,'Ingreso manual histórico Admin');
 const original=await row('manual_income_read',incomeId);ok(original.amount==='13.17'&&original.currency==='CRC'&&original.is_historical,'Importe y evidencia histórica 3C');
 ok(!(await member.client.from('manual_income_read').select('id').eq('id',incomeId)).data?.length,'Ingreso manual invisible a Colaborador');
 ok((await member.client.rpc('register_manual_income',{target:randomUUID(),payload:{amount:'1'}})).error?.code==='42501','Colaborador no registra ingreso manual');
 for(const amount of ['0','-1','1.001'])ok((await admin.client.rpc('register_manual_income',{target:randomUUID(),payload:{amount}})).error?.code==='22023','Ingreso inválido rechazado '+amount);
 for(const width of [320,1440]){await admin.page.setViewportSize({width,height:900});for(const path of ['/pedidos/'+id,'/ingresos-manuales/'+incomeId]){await admin.page.goto('http://localhost:3000'+path);await admin.page.waitForLoadState('networkidle');await expect(admin.page.getByRole('heading',{level:1})).toBeVisible();await expect(admin.page.getByRole('heading',{name:'No pudimos cargar esta página'})).toHaveCount(0);ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'UI regresión '+width+' '+path.split('/')[1]);}}
 await admin.page.goto('http://localhost:3000/gastos?order='+id);await expect(admin.page.getByText('Mostrando los gastos autorizados del')).toBeVisible();ok(true,'Filtro de gastos por pedido disponible sin agregado de costos');
 const cancellation=await admin.client.rpc('void_manual_income',{target:incomeId,reason:'Cierre regresión 3D; conservar original'});ok(!cancellation.error,'Anulación ingreso manual Admin');
 const after=await row('manual_income_read',incomeId);ok(after.status==='voided'&&after.amount===original.amount&&after.income_date===original.income_date,'Original de ingreso conservado');
 const log=await admin.client.from('audit_log').select('action').eq('entity_id',incomeId);ok(log.data?.some(e=>e.action==='manual_income.created')&&log.data?.some(e=>e.action==='manual_income.voided'),'Auditoría 3C conservada');
 stage='completado';
}catch(error){console.error('FAIL '+stage+': '+error.message);process.exitCode=1;}
finally {
 if(admin){for(const id of ids){let order=await row('quotes_read',id);if(order.production_status==='delivered'){await done(admin.client,'transition_order',id,{state:'ready',reason:'Cierre regresión 3D'});order=await row('quotes_read',id);}if(order.production_status!=='cancelled')await done(admin.client,'transition_order',id,{state:'cancelled',reason:'Cierre regresión 3D; conservar historia'});}
  const income=await admin.client.from('manual_income_read').select('status').eq('id',incomeId).maybeSingle();if(income.data?.status==='valid')await admin.client.rpc('void_manual_income',{target:incomeId,reason:'Cierre regresión 3D; conservar historia'});
  if(clientId)await admin.client.from('clients').update({is_active:false}).eq('id',clientId);
 }
 await mkdir('test-results',{recursive:true});await writeFile('test-results/phase3d-regression-summary.json',JSON.stringify({stage,passed:evidence,matrix,records:{clientId,orders:ids,incomeId}},null,2));
 for(const s of sessions){await s.authClient.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
}
