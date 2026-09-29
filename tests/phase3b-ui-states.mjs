// UI real DEV; solo el fallo de transporte se induce. Sesiones en memoria y fixtures conservados.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { businessDate } from '../src/features/orders/domain.ts';
const expect=baseExpect.configure({timeout:30000});
if(process.env.SIGCA_REAL_TESTS!=='1')throw Error('Requiere autorización DEV');
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(url!=='https://pysgfnwsycgoneaecgcl.supabase.co')throw Error('Proyecto incorrecto');
const infrastructure=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch(),sessions=[],passed=[];let admin,clientId,orderId;
async function session(email){
 const {data:link,error}=await infrastructure.auth.admin.generateLink({type:'magiclink',email});if(error)throw Error('Sesión no disponible');
 const jar=new Map();const auth=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:cs=>cs.forEach(c=>jar.set(c.name,c.value))}});
 const result=await auth.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});if(result.error)throw Error('Sesión no válida');
 const api=createClient(url,key,{accessToken:async()=>result.data.session.access_token});
 const context=await browser.newContext();await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})));
 const s={auth,api,context,page:await context.newPage()};sessions.push(s);return s;
}
function ok(label){passed.push(label);console.log('PASS: '+label);}
async function invoke(op,payload,revision){const r=await admin.api.rpc(op,{target:orderId,expected_revision:revision,payload});if(r.error)throw Error(op+' '+r.error.code);}
try{
 admin=await session(process.env.SIGCA_TEST_ADMIN_EMAIL);const member=await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const profile=await admin.api.from('profiles').select('role,status').eq('id',(await admin.auth.auth.getUser()).data.user.id).single();if(profile.data?.role!=='admin'||profile.data.status!=='active')throw Error('Admin activo requerido');
 const c=await admin.api.from('clients').insert({name:'VERIFICACION-F3B-ESTADOS-'+Date.now(),phone:'83639663'}).select('id').single();if(c.error)throw Error('Cliente fixture');clientId=c.data.id;orderId=randomUUID();
 await invoke('save_quote',{client_id:clientId,order_date:businessDate(),requested_delivery_date:businessDate(),discount_amount:'0',items:[{id:randomUUID(),product_name_snapshot:'VERIFICACION-F3B-ESTADOS',quantity:'1',unit_price:'10',discount_amount:'0',is_active:true}]},0);
 await admin.page.goto('http://localhost:3000/pedidos/'+orderId);await expect(admin.page.getByText('No hay operaciones registradas todavía.')).toBeVisible();ok('Historial operativo vacío de cotización');
 await invoke('confirm_order',{},1);
 for(const [role,who] of [['Admin',admin],['Colaborador',member]])for(const width of [320,1440]){
  await who.page.setViewportSize({width,height:950});await who.page.goto('http://localhost:3000/pedidos/'+orderId);
  await expect(who.page.getByText('Este pedido todavía no tiene pagos.')).toBeVisible();ok(role+' '+width+' pagos vacíos reales');
  await who.page.getByLabel('Monto CRC',{exact:true}).fill('1');
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const intercept=async route=>{if(route.request().method()==='POST'){await gate;await route.abort('failed');}else await route.continue();};
  await who.page.route('**/pedidos/'+orderId,intercept);
  try{
   await who.page.getByRole('button',{name:'Registrar pago',exact:true}).click();await who.page.locator('.swal2-confirm').click();
   await expect(who.page.locator('.quote-form[aria-busy="true"]')).toBeVisible();await expect(who.page.getByRole('button',{name:'Registrar pago',exact:true})).toBeDisabled();ok(role+' '+width+' guardando visible y acción bloqueada');
  }finally{release();}
  await expect(who.page.getByRole('alert').filter({hasText:'No se pudo conectar'})).toBeFocused();await expect(who.page.getByLabel('Monto CRC',{exact:true})).toHaveValue('1');
  await who.page.unroute('**/pedidos/'+orderId,intercept);ok(role+' '+width+' error accesible conserva monto');
 }
 const payments=await admin.api.from('payments').select('id').eq('order_id',orderId);expect(payments.data).toHaveLength(0);ok('Fallo inducido no creó pagos parciales');
}catch(e){console.error('FAIL estados UI: '+e.message);process.exitCode=1;}
finally{
 if(admin&&orderId){const r=await admin.api.from('orders').select('revision,production_status').eq('id',orderId).maybeSingle();if(r.data&&r.data.production_status!=='cancelled')await invoke('transition_order',{state:'cancelled',reason:'Cierre de prueba de estados UI; conservar historia'},r.data.revision);}
 if(admin&&clientId)await admin.api.from('clients').update({is_active:false}).eq('id',clientId);
 for(const s of sessions){await s.auth.auth.signOut({scope:'local'});await s.context.close();}await browser.close();
 await writeFile('test-results/phase3b-ui-states-summary.json',JSON.stringify({complete:!process.exitCode,passed},null,2));
}
