import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect as baseExpect} from '@playwright/test';
import {devHarness} from './support/real-session.mjs';
const expect=baseExpect.configure({timeout:30000}),h=await devHarness(),evidence=[];
const segment=process.env.SIGCA_UI_SEGMENT??'all';assert.ok(['all','member','network','browser'].includes(segment));
const base=process.env.SIGCA_UI_URL??'http://localhost:3003';let admin,rate,changed=false;
const check=(v,label)=>{assert.ok(v,label);evidence.push(label);console.log('PASS '+label);};
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);const member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const data=JSON.parse(await readFile('test-results/phase4c-real.json','utf8')),order=data.ids.orders[0];
 const settings=await admin.client.from('settings').select('hourly_rate').single();assert.equal(settings.error,null);rate=settings.data.hourly_rate;assert.equal(rate,null);
 const result=await admin.client.from('settings').update({hourly_rate:'573.21'}).eq('singleton',true);assert.equal(result.error,null);changed=true;
 await mkdir('test-results/phase4c-audit-ui',{recursive:true});
 const read=async u=>{const r=await u.client.rpc('work_read',{target_order:null});assert.equal(r.error,null);return r.data.sessions[0];};
 for(const [role,u] of [['admin',admin],['member',member]]){
  let p=u.page;
  for(const width of (segment==='all'||segment==='member'&&role==='member'?[320,375,768,1024,1440]:[])){
   await p.setViewportSize({width,height:900});await p.emulateMedia({reducedMotion:'reduce'});
   await p.goto(`${base}/tiempo?order=${order}`);await p.waitForLoadState('networkidle');await expect(p.getByRole('button',{name:'Iniciar',exact:true})).toBeEnabled();
   const readBefore=await u.client.rpc('work_read',{target_order:order});assert.equal(readBefore.error,null);
   const total=readBefore.data.sessions.reduce((n,s)=>n+s.worked_seconds,0);const formatted=`${Math.floor(total/3600)}:${String(Math.floor(total%3600/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
   await expect(p.getByTestId('work-total')).toContainText(formatted);
   await p.getByRole('button',{name:'Iniciar',exact:true}).click();await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
   await expect(p.locator('.work-indicator')).toContainText('PED-');
   for(const name of ['Pausar','Reanudar']){const button=p.getByRole('button',{name,exact:true});await expect(button).toBeVisible();check((await button.boundingBox()).height>=43,role+' '+width+' '+name+' táctil');await button.click();}
   await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();await expect.poll(async()=>(await read(u))?.status).toBe('running');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' '+width+' controles/indicador sin overflow');
   check(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&[...document.querySelectorAll('.work-indicator, .work-clock, .button')].every(e=>{const s=getComputedStyle(e);return s.animationName==='none'||parseFloat(s.animationDuration)<=0.01;})),role+' '+width+' reduced-motion');
   const s=await read(u);await p.close();p=await u.context.newPage();await p.setViewportSize({width,height:900});await p.goto(`${base}/dashboard`);await p.waitForLoadState('networkidle');await expect(p.locator('.work-indicator')).toContainText('PED-');
   check((await read(u)).id===s.id,role+' '+width+' cierre página/navegación conserva sesión');
   await p.goto(`${base}/tiempo?order=${order}`);await p.waitForLoadState('networkidle');await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
   await p.route('**/tiempo**',route=>route.request().method()==='POST'&&!route.request().postData()?.includes('pause')?route.abort():route.continue());
   const q=await read(u);assert.equal((await u.client.rpc('work_operate',{request_id:randomUUID(),operation:'pause',target:q.id,expected_revision:q.revision,payload:{}})).error,null);
   // Induce failed polling to preserve stale UI; the write/conflict still run against real DEV.
   await p.getByRole('button',{name:'Pausar',exact:true}).click();await expect(p.getByRole('alert').filter({hasText:/cambió|recarga/}).first()).toBeVisible();check(true,role+' '+width+' conflicto visible (polling pausado en prueba)');await p.unroute('**/tiempo**');await p.getByRole('button',{name:'Recargar estado',exact:true}).click();
   await expect(p.getByRole('button',{name:'Reanudar',exact:true})).toBeVisible();
   const finish=p.getByRole('button',{name:'Finalizar',exact:true});check((await finish.boundingBox()).height>=43,role+' '+width+' Finalizar táctil');await finish.click();await p.locator('.swal2-confirm').click();await expect.poll(async()=>await read(u)).toBeUndefined();
   await p.screenshot({path:`test-results/phase4c-audit-ui/${role}-${width}.png`,fullPage:true});
  }
  if(segment==='all'&&role==='admin')for(const width of [320,375,768,1024,1440]){
   const target=randomUUID();assert.equal((await member.client.rpc('work_operate',{request_id:randomUUID(),operation:'start',target,expected_revision:null,payload:{order_id:order,activity:'Auditoría intervención UI'}})).error,null);
   await p.setViewportSize({width,height:900});await p.goto(`${base}/tiempo?order=${order}`);await p.waitForLoadState('networkidle');await expect(p.getByRole('heading',{name:'Sesiones abiertas del equipo'})).toBeVisible();
   for(const action of ['Pausar','Finalizar']){await p.getByRole('button',{name:action,exact:true}).click();await p.locator('.swal2-textarea').fill('Auditoría 4C intervención explícita');await p.locator('.swal2-confirm').click();await expect.poll(async()=> (await member.client.from('work_sessions').select('status').eq('id',target).single()).data?.status).toBe(action==='Pausar'?'paused':'finished');check(true,'Admin '+width+' '+action+' ajena con motivo');}
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin '+width+' intervención sin overflow');
  }
  if(segment==='all'||segment==='network'){
  await p.goto(`${base}/tiempo?order=${order}`);await p.waitForLoadState('networkidle');
  // Lost acknowledgement after a successful real server action. The network failure is simulated.
  await p.waitForLoadState('networkidle');await expect(p.getByRole('button',{name:'Iniciar',exact:true})).toBeEnabled();let intercepted=false;
  await p.route('**/tiempo**',async route=>{if(!intercepted&&route.request().method()==='POST'&&route.request().postData()?.includes('start')){intercepted=true;await route.fetch();await route.abort();}else await route.continue();});
  await p.getByRole('button',{name:'Iniciar',exact:true}).click();await expect.poll(()=>intercepted).toBe(true);await expect(p.getByRole('alert').filter({hasText:/confirmada|conexión/}).first()).toBeVisible();check(intercepted,role+' respuesta perdida inducida después de COMMIT');
  const committed=await read(u);assert.ok(committed);await p.unroute('**/tiempo**');await p.getByRole('button',{name:'Iniciar',exact:true}).click();await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
  check((await read(u)).id===committed.id,role+' reintento tras respuesta perdida no duplica');
  await p.getByRole('button',{name:'Finalizar',exact:true}).click();await p.locator('.swal2-confirm').click();await expect.poll(async()=>await read(u)).toBeUndefined();
  }
 }
 if(segment==='all'||segment==='browser'){
 const browserSessions=[];
 for(const [role,u,email] of [['admin',admin,process.env.SIGCA_TEST_ADMIN_EMAIL],['member',member,process.env.SIGCA_TEST_MEMBER_EMAIL]]){const target=randomUUID();assert.equal((await u.client.rpc('work_operate',{request_id:randomUUID(),operation:'start',target,expected_revision:null,payload:{order_id:order,activity:'Cierre completo del navegador'}})).error,null);browserSessions.push({role,u,email,target});}
 await h.browser.close();const reopened=await devHarness();
 try{for(const s of browserSessions){check((await read(s.u)).id===s.target,s.role+' cierre del proceso navegador conserva sesión');const fresh=await reopened.login(s.email);await fresh.page.goto(`${base}/tiempo?order=${order}`);await fresh.page.waitForLoadState('networkidle');await expect(fresh.page.locator('.work-indicator')).toContainText('PED-');check((await read(fresh)).id===s.target,s.role+' navegador nuevo reconstruye sesión');const row=await read(fresh);assert.equal((await fresh.client.rpc('work_operate',{request_id:randomUUID(),operation:'finish',target:s.target,expected_revision:row.revision,payload:{}})).error,null);}}finally{await reopened.close();}
 }
}finally{if(changed)assert.equal((await admin.client.from('settings').update({hourly_rate:rate}).eq('singleton',true)).error,null);await writeFile(`test-results/phase4c-audit-ui-${segment}.json`,JSON.stringify({evidence,environment:'UI DEV real; respuestas perdidas inducidas'},null,2));await h.close();}
