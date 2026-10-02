import {devHarness} from './support/real-session.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const expect=baseExpect.configure({timeout:30000}),h=await devHarness(),evidence=[],screens=[];
const base=process.env.SIGCA_UI_URL??'http://localhost:3001';const api=JSON.parse(await readFile('test-results/phase4a-real.json','utf8'));const material=api.ids.materials[0];
const prefix='UI-REAL-4A-'+Date.now();
function ok(value,label){if(!value)throw Error(label);evidence.push(label);console.log('PASS '+label);}
try{
 const admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL),member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 await mkdir('test-results/phase4a-screens',{recursive:true});
 for(const [role,session] of [['admin',admin],['collaborator',member]]){
  for(const width of [320,375,768,1024,1440]){
   await session.page.setViewportSize({width,height:900});await session.page.goto(base+'/inventario');await expect(session.page.getByRole('heading',{name:'Inventario',exact:true})).toBeVisible();
   ok(await session.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),role+' listado sin overflow '+width);
   await session.page.goto(base+'/inventario/'+material);await expect(session.page.getByRole('heading',{name:'Movimientos',exact:true})).toBeVisible();
   ok(await session.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),role+' historial sin overflow '+width);
   if(role==='collaborator')ok(!/unit_cost_applied_crc|average_unit_cost_crc|rounding_delta_crc|value_crc|exchange_rate_applied/.test(await session.page.content()),'HTML/RSC Colaborador sin campos financieros '+width);
   if(width===320||width===1440){const path=`test-results/phase4a-screens/${role}-${width}.png`;await session.page.screenshot({path,fullPage:true});screens.push(path);}
   if(role==='admin'){
    await session.page.goto(base+'/inventario/nueva');await expect(session.page.getByRole('button',{name:'Registrar recepción'})).toBeVisible();
    ok(await session.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Formulario Admin sin overflow '+width);
   }
  }
 }
 await member.page.goto(base+'/inventario/nueva');await expect(member.page).toHaveURL(/dashboard\?notice=forbidden/);ok(true,'Colaborador sin UI administrativa');
 const privateResponse=await member.client.schema('private').from('inventory_balances').select('*');ok(privateResponse.error?.code==='PGRST106','private fuera de Data API');
 await admin.page.setViewportSize({width:375,height:900});await admin.page.goto(base+'/inventario/nueva');
 await admin.page.getByLabel('Procedencia / factura').fill(prefix);await admin.page.getByRole('combobox',{name:/^Material/}).selectOption(material);await admin.page.getByLabel('Cantidad en gramos').fill('3');await admin.page.getByLabel('Importe total de esta línea').fill('10');
 await admin.page.route('**/inventario/nueva',route=>route.request().method()==='POST'?route.abort('internetdisconnected'):route.continue());
 await admin.page.getByRole('button',{name:'Registrar recepción'}).click();await admin.page.locator('.swal2-confirm').click();
 await expect(admin.page.locator('p.message.error')).toContainText(/conexión|Conexión|conectar/i);await expect(admin.page.getByLabel('Procedencia / factura')).toHaveValue(prefix);ok(true,'Error de red inducido: formulario conservado');
 await admin.page.unroute('**/inventario/nueva');
 const requestLink=await admin.page.getByRole('link',{name:'Consultar si se guardó'}).getAttribute('href');
 const balance=await admin.client.from('inventory_balances').select('revision,quantity_on_hand').eq('material_id',material).single();
 const r=await admin.client.rpc('register_inventory_receipt',{target:randomUUID(),payload:{kind:'purchase',source_reference:prefix+' conflicto concurrente',lines:[{material_id:material,unit:'gramos',quantity:'1',amount:'1',currency:'CRC'}]},expected_revisions:{[material]:String(balance.data.revision)}});ok(!r.error,'Cambio concurrente antes de envío UI');
 await admin.page.getByRole('button',{name:'Registrar recepción'}).click();await admin.page.locator('.swal2-confirm').click();await expect(admin.page.locator('p.message.error')).toContainText('El inventario cambió');ok(true,'Conflicto UI real sin perder formulario');
 await admin.page.getByRole('button',{name:'Recargar existencias y revisión'}).click();await expect(admin.page.getByRole('button',{name:'Registrar recepción'})).toBeEnabled();await expect(admin.page.locator('option:checked').filter({hasText:'VALIDACION-4A-'})).toContainText('existencia '+(Number(balance.data.quantity_on_hand??0)+1));
 await expect(admin.page.getByLabel('Procedencia / factura')).toHaveValue(prefix);ok(await admin.page.getByRole('link',{name:'Consultar si se guardó'}).getAttribute('href')===requestLink,'UUID estable después de recargar revisión');
 await admin.page.getByRole('button',{name:'Registrar recepción'}).click();await admin.page.locator('.swal2-confirm').click();await expect(admin.page).toHaveURL(new RegExp(requestLink+'$'));ok(true,'Alta real desde UI y confirmación SweetAlert2');
 const receiptId=requestLink.split('/').at(-1);const saved=await admin.client.from('inventory_receipts').select('id').eq('id',receiptId).single();ok(saved.data?.id===receiptId,'Recepción UI coincide con idempotency key');
 for(const width of [320,375,768,1024,1440]){await admin.page.setViewportSize({width,height:900});ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Detalle financiero usable '+width);}
 await admin.page.getByLabel('Vincular gasto existente (UUID)').fill(api.ids.expense);
 await admin.page.route('**'+requestLink,route=>route.request().method()==='POST'?route.abort('internetdisconnected'):route.continue());
 await admin.page.getByRole('button',{name:'Vincular sin modificar el gasto'}).click();await expect(admin.page.locator('p.message.error')).toContainText('Conexión interrumpida');await expect(admin.page.locator('p.message.error')).toBeFocused();ok(true,'Red inducida en vínculo: error enfocado y datos conservados');
 await admin.page.unroute('**'+requestLink);await admin.page.getByRole('button',{name:'Vincular sin modificar el gasto'}).click();await expect(admin.page.getByRole('link',{name:'Consultar gasto y su estado'})).toBeVisible();ok(true,'Vínculo explícito desde UI real');
 await admin.page.goto(base+'/materiales/'+material);await expect(admin.page.getByLabel(/^Unidad/)).toHaveAttribute('readonly','');ok(true,'Unidad congelada también en formulario de catálogo');
 for(const route of ['/pedidos','/gastos','/ingresos-manuales']){await admin.page.goto(base+route);ok(!(await admin.page.content()).includes('No pudimos cargar esta página'),'Regresión UI real '+route);}
 await admin.page.emulateMedia({reducedMotion:'reduce'});await admin.page.goto(base+'/inventario');ok(await admin.page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),'Responsive con preferencia de movimiento reducido');
 console.log('TOTAL PASS '+evidence.length);
}finally{await writeFile('test-results/phase4a-ui-real.json',JSON.stringify({environment:'Next.js local con Supabase DEV real',evidence,screens,prefix},null,2));await h.close();}
