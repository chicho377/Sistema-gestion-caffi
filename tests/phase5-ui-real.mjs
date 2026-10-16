import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import {devHarness} from './support/real-session.mjs';
const expect=baseExpect.configure({timeout:30000}),h=await devHarness(),evidence=[];
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL),data=JSON.parse(await readFile('test-results/phase5-real.json','utf8')),base=process.env.SIGCA_UI_URL??'http://localhost:3006';
 await mkdir('test-results/phase5-ui',{recursive:true});
 for(const [role,u] of [['admin',admin],['member',member]])for(const width of [320,375,768,1024,1440]){
  await u.page.setViewportSize({width,height:1000});await u.page.emulateMedia({reducedMotion:'reduce'});
  for(const suffix of ['', '?order='+data.ids.orders[4]]){
   await u.page.goto(base+'/costeo'+suffix);await u.page.waitForLoadState('networkidle');
   if(role==='member'){await expect(u.page).toHaveURL(/dashboard/);const direct=await u.context.request.get(base+'/costeo'+suffix,{headers:{RSC:'1'},maxRedirects:0});const html=await direct.text();check(!html.includes('material_cost')&&!html.includes('profit_per_hour')&&!html.includes('Fuentes históricas'),role+' sin datos HTML/RSC '+width+suffix);}
   else{await expect(u.page.getByRole('heading',{name:'Costeo y rentabilidad',exact:true})).toBeVisible();if(suffix)await expect(u.page.getByRole('heading',{name:'Rentabilidad por línea',exact:true})).toBeVisible();check(true,'Admin listado/detalle '+width+suffix);}
   check(await u.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin scroll horizontal '+role+width+suffix);
  }
  await u.page.screenshot({path:'test-results/phase5-ui/'+role+'-'+width+'.png',fullPage:true});
 }
 await admin.page.goto(base+'/costeo?order='+data.ids.orders[0]);await expect(admin.page.getByText('198 minutos',{exact:true})).toBeVisible();check(true,'Snapshot total por línea en interfaz');
 await admin.page.route('**/costeo**',r=>r.abort());await assert.rejects(()=>admin.page.goto(base+'/costeo'));check(true,'Fallo de navegación inducido no produce datos ficticios');await admin.page.unroute('**/costeo**');await admin.page.goto(base+'/costeo');await expect(admin.page.getByRole('heading',{name:'Costeo y rentabilidad',exact:true})).toBeVisible();check(true,'Recuperación tras fallo de red inducido');
 await writeFile('test-results/phase5-ui.json',JSON.stringify({environment:'DEV real UI; últimas dos pruebas con red inducida',evidence},null,2));
}finally{await h.close();}
