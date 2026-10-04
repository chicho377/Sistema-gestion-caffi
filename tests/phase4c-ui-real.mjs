import {devHarness} from './support/real-session.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import assert from 'node:assert/strict';
const expect=baseExpect.configure({timeout:30000}),h=await devHarness(),evidence=[],base=process.env.SIGCA_UI_URL??'http://localhost:3003';
let admin,oldRate,changed=false;
const state=JSON.parse(await readFile('test-results/phase4c-real.json','utf8')),order=state.ids.orders[0];
function check(v,label){assert.ok(v,label);evidence.push(label);console.log('PASS '+label);}
try{
 await mkdir('test-results/phase4c-ui',{recursive:true});admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);
 const r=await admin.client.from('settings').select('hourly_rate').single();assert.equal(r.error,null);oldRate=r.data.hourly_rate;
 for(const [role,email] of [['admin',process.env.SIGCA_TEST_ADMIN_EMAIL],['member',process.env.SIGCA_TEST_MEMBER_EMAIL]]){
 const u=role==='admin'?admin:await h.login(email),p=u.page;
 for(const width of [320,375,768,1024,1440]){
 await p.setViewportSize({width,height:900});const response=await p.goto(`${base}/tiempo?order=${order}`);await expect(p.getByRole('heading',{name:'Control de horas',exact:true})).toBeVisible();
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' '+width+' sin overflow');
 await expect(p.getByRole('button',{name:'Iniciar',exact:true})).toBeVisible();await expect.poll(async()=> (await p.getByRole('button',{name:'Iniciar',exact:true}).boundingBox())?.height??0).toBeGreaterThanOrEqual(43);check(true,role+' '+width+' táctil estable');
 if(role==='member'){check(!/hourly_rate_applied|Tarifa histórica|captured_by/.test(await response.text()),role+' '+width+' HTML/RSC sin tarifa');await expect(p.getByText('Registrar sesión histórica',{exact:true})).toHaveCount(0);}
 else {await p.getByText('Corregir sesión',{exact:true}).first().click();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin '+width+' corrección responsive');await p.getByText('Corregir sesión',{exact:true}).first().click();await p.getByText('Registrar sesión histórica',{exact:true}).click();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin '+width+' histórico responsive');await p.getByText('Registrar sesión histórica',{exact:true}).click();}
 await p.screenshot({path:`test-results/phase4c-ui/${role}-${width}.png`,fullPage:true});
 }
 await expect(p.getByText(/Falta configurar una tarifa válida/)).toBeVisible();await expect(p.getByRole('button',{name:'Iniciar',exact:true})).toBeDisabled();check(true,role+' sin tarifa bloqueado');
 changed=true;assert.equal((await admin.client.from('settings').update({hourly_rate:'456.78'}).eq('singleton',true)).error,null);await p.reload();await expect(p.getByRole('button',{name:'Iniciar',exact:true})).toBeEnabled();await p.getByLabel('Actividad',{exact:true}).first().fill('Validación UI 4C');await p.getByRole('button',{name:'Iniciar',exact:true}).click();
 await expect.poll(async()=>{const r=await u.client.rpc('work_read',{target_order:null});return r.data?.sessions[0]?.status;}).toBe('running');
 const activeId=(await u.client.rpc('work_read',{target_order:null})).data.sessions[0].id;check(true,role+' Play real desde UI');await p.reload();await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();check(true,role+' recarga conserva sesión');
 const second=await h.login(email);await second.page.goto(`${base}/tiempo?order=${order}`);await expect(second.page.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();check(true,role+' otro contexto/dispositivo conserva sesión');
 await p.getByRole('button',{name:'Pausar',exact:true}).click();await expect(p.getByRole('button',{name:'Reanudar',exact:true})).toBeVisible();await p.getByRole('button',{name:'Reanudar',exact:true}).click();await expect(p.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();await p.getByRole('button',{name:'Pausar',exact:true}).click();await expect(p.getByRole('button',{name:'Reanudar',exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Finalizar',exact:true}).click();await p.locator('.swal2-confirm').click();await expect.poll(async()=>{const r=await u.client.rpc('work_read',{target_order:null});return r.data?.sessions.length;}).toBe(0);check(true,role+' pausa/reanuda/finaliza real');
 if(role==='admin'){await p.reload();const detail=p.locator('tbody tr').first().locator('details').filter({has:p.getByText('Corregir sesión',{exact:true})});await detail.locator('summary').click();await detail.locator('input[name=activity]').fill('Corrección UI 4C validada');await detail.locator('textarea[name=reason]').fill('Validación administrativa desde interfaz');await detail.getByRole('button',{name:'Guardar historia'}).click();await p.locator('.swal2-confirm').click();await expect.poll(async()=> (await u.client.from('work_sessions').select('activity').eq('id',activeId).single()).data?.activity).toBe('Corrección UI 4C validada');check(true,'Admin corrige actividad real desde UI');}
 await p.reload();await p.route('**/tiempo**',route=>route.request().method()==='POST'?route.abort():route.continue());await p.getByRole('button',{name:'Iniciar',exact:true}).click();await expect(p.getByRole('alert').filter({hasText:/confirmada|conexión/}).first()).toBeVisible();check(true,role+' fallo de red inducido explícito');await p.unroute('**/tiempo**');await p.reload();
 assert.equal((await admin.client.from('settings').update({hourly_rate:oldRate}).eq('singleton',true)).error,null);changed=false;
 }
}finally{if(changed)await admin.client.from('settings').update({hourly_rate:oldRate}).eq('singleton',true);await writeFile('test-results/phase4c-ui.json',JSON.stringify({evidence,environment:'UI Supabase DEV real; fallos de red inducidos identificados'},null,2));await h.close();}
