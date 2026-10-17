import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {devHarness} from './support/real-session.mjs';
const h=await devHarness(),evidence=[],base=process.env.SIGCA_UI_URL??'http://localhost:3010';
const check=(v,n)=>{assert.ok(v,n);evidence.push(n);console.log('PASS '+n);};
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL),examples=JSON.parse(await readFile('test-results/phase6-real.json','utf8')).examples;
 await mkdir('test-results/phase6-ui',{recursive:true});
 for(const [role,u] of [['admin',admin],['member',member]])for(const width of [320,375,768,1024,1440]){
  await u.page.setViewportSize({width,height:1000});await u.page.emulateMedia({reducedMotion:'reduce'});
  for(const route of ['/dashboard','/reportes?kind=inventory','/reportes?kind=hours']){
   const r=await u.page.goto(base+route);check(r.status()===200,role+' UI '+route+' '+width);
   await u.page.getByRole('button',{name:'Aplicar filtros'}).waitFor();
   check(await u.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),role+' sin overflow '+route+' '+width);
  }
  await u.page.screenshot({path:`test-results/phase6-ui/${role}-${width}.png`,fullPage:true});
 }
 for(const kind of ['orders','balances','payments','cash','profit','inventory','movements','hours','shipments','audit']){
  const query=new URLSearchParams({kind,period:'custom',from:'1990-01-01',to:'2099-12-31',record:examples[kind]??''});
  for(const format of ['xlsx','pdf']){
   const r=await admin.context.request.get(`${base}/reportes/export?${query}&format=${format}`);check(r.status()===200,'Exportación real '+kind+' '+format);
   const b=await r.body();if(format==='pdf')check(b.subarray(0,5).toString()==='%PDF-','PDF válido '+kind);else{const zip=unzipSync(b);check(Boolean(zip['xl/workbook.xml']),'XLSX válido '+kind);const xml=Object.entries(zip).filter(([k])=>k.endsWith('.xml')).map(([,v])=>strFromU8(v)).join('');check(xml.includes('America/Costa_Rica'),'XLSX zona '+kind);check(!/<f[ >]/.test(xml),'XLSX sin fórmulas inyectadas '+kind);}
   await writeFile(`test-results/phase6-ui/${kind}.${format}`,b);
  }
 }
 for(const kind of ['orders','balances','payments','cash','profit','audit']){
  const r=await member.context.request.get(`${base}/reportes/export?kind=${kind}&format=pdf`);check(r.status()===403,'Exportación miembro denegada '+kind);
  await member.page.goto(`${base}/reportes?kind=${kind}`);await member.page.waitForURL('**/dashboard?notice=forbidden');check(new URL(member.page.url()).pathname==='/dashboard','URL conocida denegada '+kind);
 }
 for(const kind of ['inventory','hours','shipments']){const r=await member.context.request.get(`${base}/reportes/export?kind=${kind}&format=xlsx`);check(r.status()===200,'Export operacional miembro '+kind);const zip=unzipSync(await r.body());const xml=Object.values(zip).map(strFromU8).join('');check(!/tarifa crc|valoracion crc|promedio crc|global_profit|costo operativo crc/i.test(xml),'Export miembro sin financiero '+kind);}
 const invalid=await admin.context.request.get(base+'/reportes/export?kind=profit&format=exe');check(invalid.status()===400,'Formato manipulado rechazado');
 await admin.page.route('**/reportes**',r=>r.abort());await assert.rejects(()=>admin.page.goto(base+'/reportes'));check(true,'Red inducida');await admin.page.unroute('**/reportes**');await admin.page.goto(base+'/reportes');check(await admin.page.locator('h1').count()>0,'Recuperación de red');
 await writeFile('test-results/phase6-ui.json',JSON.stringify({evidence,environment:'DEV UI y exportaciones; últimas dos red inducida'},null,2));console.log('TOTAL '+evidence.length);
}finally{await h.close();}
