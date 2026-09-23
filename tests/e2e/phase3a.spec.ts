import { test, expect } from "@playwright/test";
for (const width of [320,375,768,1024,1440]) {
 test(`3A simulada: cotización, líneas y responsive ${width}`,async({page,request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
  await page.setViewportSize({width,height:950});
  await page.goto("/pedidos"); await expect(page).toHaveURL(/login/);
  // Separar la prueba de redirección del formulario de acceso evita heredar
  // un origen opaco de la navegación inicial del contexto de Chromium.
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("member@example.test");
  await page.getByLabel("Contraseña",{exact:true}).fill("Test-password-123!");
  await page.getByRole("button",{name:"Entrar a mi espacio"}).click(); await expect(page).toHaveURL(/dashboard/);
  await page.goto("/pedidos"); await expect(page.getByRole("heading",{name:"Cada creación comienza con una idea"})).toBeVisible();
  await page.getByRole("link",{name:"Nueva cotización",exact:true}).click();
  await page.getByRole("button",{name:"Agregar línea"}).click();
  await page.getByLabel("Nombre línea 1",{exact:true}).fill("Osito personalizado");
  await page.getByLabel("Precio línea 1",{exact:true}).fill("12.50");
  await page.getByLabel("Cantidad línea 1",{exact:true}).fill("2");
  await expect(page.getByText("₡25,00",{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel("Precio línea 1",{exact:true}).fill("0.125");
  await expect(page.getByRole("button",{name:"Guardar cotización"})).toBeDisabled();
  await page.getByLabel("Precio línea 1",{exact:true}).fill("12.50");
  await page.getByRole("button",{name:"Desactivar línea 1"}).click();
  await expect(page.getByText("₡0,00",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:/Confirmar pedido/})).toHaveCount(0);
  await page.screenshot({path:`test-results/phase3a-simulated-${width}.png`,fullPage:true});
 });
}
test("3A simulada: loading/error y recuperación de conexión",async({page,request})=>{
 await request.post("http://127.0.0.1:54329/test/reset");
 await page.goto("/login");await page.getByLabel("Correo electrónico").fill("admin@example.test");
 await page.getByLabel("Contraseña",{exact:true}).fill("Test-password-123!");await page.getByRole("button",{name:"Entrar a mi espacio"}).click(); await expect(page).toHaveURL(/dashboard/);
 try {
  await request.post("http://127.0.0.1:54329/test/catalog-state",{data:{delay:2500}});
  await page.goto("/pedidos",{waitUntil:"commit"});await expect(page.getByText("Cargando tu espacio…")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Cada creación comienza con una idea"})).toBeVisible();
  await request.post("http://127.0.0.1:54329/test/catalog-state",{data:{fail:true}});
  await page.goto("/pedidos"); await expect(page.getByRole("heading",{name:"No pudimos cargar esta página"})).toBeVisible();
  await request.post("http://127.0.0.1:54329/test/catalog-state",{data:{}});await page.reload();
  await expect(page.getByRole("heading",{name:"Cada creación comienza con una idea"})).toBeVisible();
 } finally {await request.post("http://127.0.0.1:54329/test/catalog-state",{data:{}});}
});
