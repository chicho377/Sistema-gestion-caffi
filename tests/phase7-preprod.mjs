import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),base=process.env.SIGCA_UI_URL??'http://localhost:3011',evidence=[];
const check=(value,name)=>{assert.ok(value,name);evidence.push(name);console.log('PASS '+name);};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const settings=await fetch(h.url+'/auth/v1/settings',{headers:{apikey:h.key}}).then(r=>r.json());
 check(settings.disable_signup===true,'Signup deshabilitado');check(settings.external?.anonymous_users===false||settings.external?.anonymous===false,'Anonymous deshabilitado');
 const privateApi=await member.client.schema('private').from('profiles').select('*');check(Boolean(privateApi.error),'private fuera de Data API');
 const refresh=await member.auth.auth.refreshSession();check(!refresh.error&&Boolean(refresh.data.session),'Renovación real de sesión');
 const anonymous=await fetch(base+'/dashboard',{redirect:'manual'});check(anonymous.status===307,'Ruta anónima rechazada');
 for(const [name,value] of [['x-content-type-options','nosniff'],['x-frame-options','DENY'],['referrer-policy','no-referrer']])check(anonymous.headers.get(name)===value,'Header '+name);
 const oversized=await admin.context.request.get(base+'/reportes/export?kind=audit&period=custom&from=1900-01-01&to=2099-12-31&format=xlsx');check(oversized.status()===422,'Exportación >5000 rechazada completa');
 await mkdir('test-results/phase7-ui',{recursive:true});
 const shared=['dashboard','clientes','categorias','materiales','productos','pedidos','gastos','inventario','inventario/recepciones','inventario/operaciones','tiempo','envios','reportes','mas'];
 for(const [role,u] of [['admin',admin],['member',member]])for(const width of [320,375,768,1024,1440]){
  await u.page.setViewportSize({width,height:900});await u.page.emulateMedia({reducedMotion:'reduce'});
  for(const route of [...shared,...(role==='admin'?['configuracion','usuarios','ingresos-manuales','categorias-gastos','costeo']:[])]){
   const r=await u.page.goto(base+'/'+route);await u.page.waitForLoadState('networkidle');
   check(r.status()===200&&!await u.page.getByText('Ocurrió un error inesperado',{exact:false}).count(),role+' ruta '+route+' '+width);
   check(await u.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),role+' overflow '+route+' '+width);
  }
  await u.page.keyboard.press('Tab');check(await u.page.evaluate(()=>document.activeElement!==document.body),role+' teclado '+width);
  check(await u.page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),role+' reduced motion '+width);
  await u.page.screenshot({path:`test-results/phase7-ui/${role}-${width}.png`});
 }
 await member.auth.auth.signOut({scope:'local'});const expired=await member.context.request.get(base+'/auth/session');check(expired.status()===401,'Logout invalida sesión servidor');
 await writeFile('test-results/phase7-ui.json',JSON.stringify({environment:'DEV real; sin escrituras empresariales',evidence},null,2));console.log('TOTAL '+evidence.length);
}finally{await h.close();}
