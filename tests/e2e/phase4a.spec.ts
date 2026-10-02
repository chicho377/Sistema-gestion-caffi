import {test,expect} from '@playwright/test';
for(const role of ['admin','member'])test(`4A simulada: permisos, vacío, error/red y responsive ${role}`,async({page,request})=>{
 await request.post('http://127.0.0.1:54329/test/reset');await page.goto('/login');await page.getByLabel('Correo electrónico').fill(`${role}@example.test`);await page.getByLabel('Contraseña',{exact:true}).fill('Test-password-123!');await page.getByRole('button',{name:'Entrar a mi espacio'}).click();await expect(page).toHaveURL(/dashboard/);
 for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:900});await page.goto('/inventario');await expect(page.getByRole('heading',{name:'Sin materiales para esta búsqueda'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(role==='admin')await expect(page.getByRole('link',{name:'Registrar entrada'})).toBeVisible();else await expect(page.getByRole('link',{name:'Registrar entrada'})).toHaveCount(0);}
 try{await request.post('http://127.0.0.1:54329/test/catalog-state',{data:{delay:2500}});await page.goto('/inventario',{waitUntil:'commit'});await expect(page.getByRole('status').filter({hasText:'Cargando inventario'})).toBeVisible();await expect(page.getByRole('heading',{name:'Sin materiales para esta búsqueda'})).toBeVisible();
 await request.post('http://127.0.0.1:54329/test/catalog-state',{data:{fail:true}});await page.goto('/inventario');await expect(page.getByRole('alert').filter({hasText:'No se pudo consultar el inventario'})).toBeVisible();
 }finally{await request.post('http://127.0.0.1:54329/test/catalog-state',{data:{}});}
 await page.goto('/inventario');await expect(page.getByRole('heading',{name:'Sin materiales para esta búsqueda'})).toBeVisible();
 if(role==='member'){await page.goto('/inventario/nueva');await expect(page).not.toHaveURL(/inventario\/nueva/);}
});
