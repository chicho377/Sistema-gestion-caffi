import {devHarness} from './support/real-session.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {expect as baseExpect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const expect=baseExpect.configure({timeout:30000});
const h=await devHarness(),evidence=[],base=process.env.SIGCA_UI_URL??'http://localhost:3002';
const state=JSON.parse(await readFile('test-results/phase4b-real.json','utf8'));const material=state.ids.materials[0],order=state.ids.orders[1];
function ok(v,label){if(!v)throw Error(label);evidence.push(label);console.log('PASS '+label);}
try{
 await mkdir('test-results/phase4b-ui',{recursive:true});
 for(const [role,email] of [['admin',process.env.SIGCA_TEST_ADMIN_EMAIL],['member',process.env.SIGCA_TEST_MEMBER_EMAIL]]){
  const user=await h.login(email);const p=user.page;
  for(const width of [320,375,768,1024,1440]){
   await p.setViewportSize({width,height:900});const response=await p.goto(`${base}/inventario/operaciones?material=${material}&order=${order}`);await expect(p.getByRole('heading',{name:'Consumos y devoluciones',exact:true})).toBeVisible();
   await p.getByLabel('Material',{exact:true}).selectOption(material);await p.getByLabel('Pedido',{exact:true}).selectOption(order);
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} ${width}: sin overflow de página`);
   const button=await p.getByRole('button',{name:'Registrar operación',exact:true}).boundingBox();ok(button?.height>=43,`${role} ${width}: control táctil`);
   const html=await response.text();if(role==='member'){ok(!/assigned_value_crc|unit_cost_applied_crc|rounding_delta_crc|Valoración privada|Promedio \/ costo snapshot/.test(html),`${width}: HTML/RSC Colaborador sin datos financieros`);await expect(p.getByLabel('Operación',{exact:true}).locator('option')).toHaveCount(2);}else await expect(p.getByText(/^Valor asignado:/).first()).toBeVisible();
   const operations=await p.getByLabel('Operación',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value));
   for(const operation of operations){await p.getByLabel('Operación',{exact:true}).selectOption(operation);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} ${width}: formulario ${operation} adaptable`);}
   await p.getByLabel('Operación',{exact:true}).selectOption('consumption');
   const correction=p.getByText(/Atribución corregida · revisión/).first();if(await correction.count()){await correction.click();await expect(p.getByText(/Línea anterior:/).first()).toBeVisible();await correction.click();}
   await p.screenshot({path:`test-results/phase4b-ui/${role}-${width}.png`,fullPage:true});
  }
  const balance=await user.client.from('inventory_stock_read').select('revision').eq('id',material).single(),header=await user.client.from('quotes_read').select('revision').eq('id',order).single();
  const concurrent=await user.client.rpc('inventory_operation',{target:randomUUID(),operation:'consumption',payload:{material_id:material,order_id:order,quantity:'0.0001'},expected_revisions:{[material]:balance.data.revision},expected_orders:{[order]:header.data.revision}});if(concurrent.error)throw Error('Preparación de conflicto '+concurrent.error.code);
  await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByRole('alert').filter({hasText:'existencias cambiaron'})).toBeVisible();await expect(p.getByLabel('Cantidad gramos',{exact:true})).toHaveValue('0.01');ok(true,role+': conflicto real conserva formulario');
  await p.getByRole('button',{name:'Recargar existencias y revisiones'}).click();await expect(p.getByRole('button',{name:'Registrar operación',exact:true})).toBeEnabled();
  await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByText('Operación de inventario registrada',{exact:true})).toBeVisible({timeout:30000});ok(true,role+': consumo real desde UI después de recargar');
  await p.getByLabel('Operación',{exact:true}).selectOption('return');const selectable=await p.getByLabel('Movimiento original',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent})));const last=selectable.find(o=>o.value&&o.label.includes('retornable 0.01'));if(!last)throw Error('Falta consumo retornable UI');await p.getByLabel('Movimiento original',{exact:true}).selectOption(last.value);await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');await p.getByLabel('Motivo',{exact:true}).fill('Prueba 4B devolución desde interfaz');await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();await expect(p.getByText('Operación de inventario registrada',{exact:true}).last()).toBeVisible({timeout:30000});ok(true,role+': devolución real desde UI');
  await p.getByLabel('Operación',{exact:true}).selectOption('consumption');await p.getByLabel('Cantidad gramos',{exact:true}).fill('0.01');
  await p.route('**/inventario/operaciones**',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
  await p.getByRole('button',{name:'Registrar operación',exact:true}).click();await p.locator('.swal2-confirm').click();
  await expect(p.getByRole('alert').filter({hasText:'Conexión interrumpida'})).toBeVisible({timeout:30000});await expect(p.getByLabel('Cantidad gramos',{exact:true})).toHaveValue('0.01');ok(true,role+': fallo de red inducido conserva formulario');await p.unrouteAll({behavior:'wait'});
  await p.goto(`${base}/inventario/operaciones?material=${randomUUID()}`);await expect(p.getByText('Sin movimientos en esta selección.',{exact:true})).toBeVisible();ok(true,role+': historial vacío sin datos inventados');
 }
}finally{await writeFile('test-results/phase4b-ui-real.json',JSON.stringify({environment:'UI contra DEV; fallos de red inducidos separados',evidence},null,2));await h.close();}
