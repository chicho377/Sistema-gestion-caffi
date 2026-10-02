// Sesiones de prueba DEV solo en memoria. No envía correos ni cambia contraseñas.
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium} from '@playwright/test';
export async function devHarness(){
 if(process.env.SIGCA_REAL_TESTS!=='1')throw Error('Requiere SIGCA_REAL_TESTS=1');
 process.loadEnvFile('.env.local');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url!=='https://pysgfnwsycgoneaecgcl.supabase.co')throw Error('Proyecto incorrecto');
 const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const browser=await chromium.launch(),sessions=[];let serverDate;
 async function login(email){
  const {data:users}=await service.auth.admin.listUsers();const identity=users?.users.find(u=>u.email===email);
  if(!identity?.email_confirmed_at)throw Error('Cuenta confirmada existente requerida');
  const {data:link,error}=await service.auth.admin.generateLink({type:'magiclink',email});if(error)throw Error('No se pudo preparar sesión');
  const jar=new Map();const auth=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
  const result=await auth.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});if(result.error)throw Error('No se pudo autenticar');
  const context=await browser.newContext();context.setDefaultTimeout(30000);await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})));
  const client=createClient(url,key,{accessToken:async()=>result.data.session.access_token,global:{fetch:async(input,init)=>{const response=await fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(30000)});serverDate=response.headers.get('date');return response;}}});
  const value={client,auth,context,page:await context.newPage(),id:identity.id};sessions.push(value);return value;
 }
 return {url,key,service,anon,browser,login,serverNow:()=>Date.parse(serverDate),close:async()=>{for(const s of sessions){await s.auth.auth.signOut({scope:'local'});await s.context.close();}await browser.close();}};
}
