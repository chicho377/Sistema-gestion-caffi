import {devHarness} from './support/real-session.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const expect=baseExpect.configure({timeout:30000});
const h=await devHarness(),evidence=[],base=process.env.SIGCA_UI_URL??'http://localhost:3002';
const state=JSON.parse(await readFile('test-results/phase4b-real.json','utf8'));const material=state.ids.materials[0],order=state.ids.orders[1];
let materialAdmin,originalActive;
function ok(v,label){if(!v)throw Error(label);evidence.push(label);console.log('PASS '+label);}
try{
 await mkdir('test-results/phase4b-ui',{recursive:true});
 materialAdmin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);const prior=await materialAdmin.client.from('materials').select('is_active').eq('id',material).single();originalActive=prior.data.is_active;const disabled=await materialAdmin.client.from('materials').update({is_active:false}).eq('id',material);if(disabled.error)throw Error('Fixture material inactivo');
 for(const [role,email] of [['admin',process.env.SIGCA_TEST_ADMIN_EMAIL],['member',process.env.SIGCA_TEST_MEMBER_EMAIL]]){
  const user=await h.login(email);const p=user.page;const responseChecks=[];
  if(role==='member')p.on('response',response=>{if(response.url().startsWith(base)&&response.request().method()==='POST')responseChecks.push(response.text().then(text=>{ok(!/assigned_value_crc|unit_cost_applied_crc|rounding_delta_crc|average_unit_cost_crc|exchange_rate_applied|amount_original|rate_origin/.test(text),'Server Action Colaborador sin costos/tasas');}).catch(e=>{if(!response.request().failure())throw e;}));});
  await p.emulateMedia({reducedMotion:'reduce'});await p.goto(`${base}/pedidos/${order}`);await p.getByRole('link',{name:'Materiales: consumos y devoluciones'}).click();await expect(p.getByRole('heading',{name:'Consumos y devoluciones',exact:true})).toBeVisible();ok(true,role+': acceso desde pedido');
  for(const width of [320,375,768,1024,1440]){
   await p.setViewportSize({width,height:900});const response=await p.goto(`${base}/inventario/operaciones?material=${material}&order=${order}`);await expect(p.getByRole('heading',{name:'Consumos y devoluciones',exact:true})).toBeVisible();
   await p.getByLabel('Material',{exact:true}).selectOption(material);await p.getByLabel('Pedido',{exact:true}).selectOption(order);
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} ${width}: sin overflow de página`);await expect(p.getByLabel('Material',{exact:true}).locator('option:checked')).toContainText('(inactivo)');
   const button=await p.getByRole('button',{name:'Registrar operación',exact:true}).boundingBox();ok(button?.height>=43,`${role} ${width}: control táctil`);
   const html=await response.text();if(role==='member'){ok(!/assigned_value_crc|unit_cost_applied_crc|rounding_delta_crc|Valoración privada|Promedio \/ costo snapshot/.test(html),`${width}: HTML/RSC Colaborador sin datos financieros`);await expect(p.getByLabel('Operación',{exact:true}).locator('option')).toHaveCount(2);}else await expect(p.getByText(/^Valor asignado:/).first()).toBeVisible();
   const operations=await p.getByLabel('Operación',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value));
   for(const operation of operations){await p.getByLabel('Operación',{exact:true}).selectOption(operation);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} ${width}: formulario ${operation} adaptable`);}
   await p.getByLabel('Operación',{exact:true}).selectOption('consumption');
   const correction=p.getByText(/Atribución corregida · revisión/).first();if(await correction.count()){await correction.click();await expect(p.getByText(/Línea anterior:/).first()).toBeVisible();await correction.click();}
   await p.getByLabel('Cantidad gramos',{exact:true}).focus();ok(await p.getByLabel('Cantidad gramos',{exact:true}).evaluate(el=>el===document.activeElement&&parseFloat(getComputedStyle(el).fontSize)>=16),role+' '+width+': foco e input accesibles');
   ok(await p.getByRole('button',{name:'Registrar operación',exact:true}).evaluate(el=>matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(el).animationName==='none'&&getComputedStyle(el).transitionDuration==='0s'),role+' '+width+': movimiento reducido');
   await p.screenshot({path:`test-results/phase4b-ui/${role}-${width}.png`,fullPage:true});
  }
  await p.getByLabel('Cantidad gramos',{exact:true}).fill('999999999');await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByRole('alert').filter({hasText:'Stock insuficiente'})).toBeVisible();ok(true,role+': stock insuficiente en UI');
  const availableLines=await user.client.from('quote_items_read').select('id').eq('order_id',order).eq('is_active',true);await p.locator('select[name="order_item_id"]').selectOption(availableLines.data[0].id);ok(true,role+': consumo desde línea seleccionada');
  const balance=await user.client.from('inventory_stock_read').select('revision').eq('id',material).single(),header=await user.client.from('quotes_read').select('revision').eq('id',order).single();
  const concurrent=await user.client.rpc('inventory_operation',{target:randomUUID(),operation:'consumption',payload:{material_id:material,order_id:order,quantity:'0.0001'},expected_revisions:{[material]:balance.data.revision},expected_orders:{[order]:header.data.revision}});if(concurrent.error)throw Error('Preparación de conflicto '+concurrent.error.code);
  await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByRole('alert').filter({hasText:'existencias cambiaron'})).toBeVisible();await expect(p.getByLabel('Cantidad gramos',{exact:true})).toHaveValue('0.01');ok(true,role+': conflicto real conserva formulario');
  await p.getByRole('button',{name:'Recargar existencias y revisiones'}).click();await expect(p.getByRole('button',{name:'Registrar operación',exact:true})).toBeEnabled();
  await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByText('Operación de inventario registrada',{exact:true})).toBeVisible({timeout:30000});ok(true,role+': consumo real desde UI después de recargar');
  await p.getByLabel('Operación',{exact:true}).selectOption('return');const selectable=await p.getByLabel('Movimiento original',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent})));const last=selectable.find(o=>o.value&&o.label.includes('retornable 0.01'));if(!last)throw Error('Falta consumo retornable UI');await p.getByLabel('Movimiento original',{exact:true}).selectOption(last.value);await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');await p.getByLabel('Motivo',{exact:true}).fill('Prueba 4B devolución desde interfaz');await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByText('Operación de inventario registrada',{exact:true}).last()).toBeVisible({timeout:30000});await expect.poll(async()=>{const r=await user.client.from('inventory_operations_read').select('returnable_quantity').eq('id',last.value).single();return Number(r.data.returnable_quantity);}).toBe(0);ok(true,role+': devolución real desde UI');
  if(role==='admin'){
   const candidates=await user.client.from('inventory_operations_read').select('id').eq('material_id',material).eq('order_id',order).eq('movement_type','consumption').limit(1);const source=candidates.data[0].id;
   const prior=await user.client.from('inventory_stock_read').select('stock,revision').eq('id',material).single();
   await p.getByLabel('Operación',{exact:true}).selectOption('attribution_correction');await p.getByLabel('Movimiento original',{exact:true}).selectOption(source);await p.getByLabel('Pedido corregido',{exact:true}).selectOption(state.ids.orders[0]);await p.getByLabel('Motivo',{exact:true}).fill('Auditoría UI corrección de atribución');
   await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByRole('button',{name:'Registrar operación',exact:true})).toBeEnabled();
   await expect.poll(async()=>{const r=await user.client.from('inventory_operations_read').select('order_id').eq('id',source).single();return r.data.order_id;}).toBe(state.ids.orders[0]);const after=await user.client.from('inventory_stock_read').select('stock,revision').eq('id',material).single();ok(JSON.stringify(prior.data)===JSON.stringify(after.data),'UI Admin corrige atribución sin tocar stock/revisión física');
  }
  await p.getByLabel('Operación',{exact:true}).selectOption('consumption');await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');
  await p.route('**/inventario/operaciones**',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
  await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();
  await expect(p.getByRole('alert').filter({hasText:'Conexión interrumpida'})).toBeVisible({timeout:30000});await expect(p.getByLabel('Cantidad gramos',{exact:true})).toHaveValue('0.01');ok(true,role+': fallo de red inducido conserva formulario');await p.unrouteAll({behavior:'wait'});
  await p.goto(`${base}/inventario/operaciones?material=${randomUUID()}`);await expect(p.getByText('Sin movimientos en esta selección.',{exact:true})).toBeVisible();ok(true,role+': historial vacío sin datos inventados');await Promise.all(responseChecks);
 }
}finally{if(materialAdmin&&originalActive!==undefined){const r=await materialAdmin.client.from('materials').update({is_active:originalActive}).eq('id',material);if(r.error)throw Error('Restaurar material fixture');}await writeFile('test-results/phase4b-audit-ui-real.json',JSON.stringify({environment:'UI contra DEV; fallos de red inducidos separados',evidence},null,2));await h.close();}
