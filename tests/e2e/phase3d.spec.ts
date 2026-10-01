import { test, expect } from "@playwright/test";
test("3D simulada: loading, vacío, error de lectura y recuperación", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Test-password-123!");
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await expect(page).toHaveURL(/dashboard/);
  try {
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: { delay: 2500 } });
    await page.goto("/gastos", { waitUntil: "commit" });
    await expect(page.getByRole("status").filter({ hasText: "Cargando…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Todavía no hay gastos" })).toBeVisible();
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: { fail: true } });
    await page.goto("/gastos", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "No pudimos cargar esta página" })).toBeVisible({ timeout: 20000 });
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: {} });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Todavía no hay gastos" })).toBeVisible();
    const id = "96000000-0000-4000-8000-000000000001";
    await request.post("http://127.0.0.1:54329/test/expense-preview", { data: { expense: {
      id, category_id: "96000000-0000-4000-8000-000000000002", revision: 1,
      amount: "1.00", currency: "USD", amount_crc: "500.50", status: "valid",
      expense_date: "2026-09-30T12:00:00-06:00", created_at: "2026-09-30T12:00:00-06:00",
      created_by: "00000000-0000-4000-8000-000000000001", description: "Gasto de prueba simulado",
      exchange_rate_applied: "500.50000000000000001", exchange_rate_date: "2026-09-29",
      exchange_rate_source: "BCCR via tipodecambio.paginasweb.cr", rate_is_fallback: true, rate_origin: "provider",
    } } });
    await page.goto("/gastos/" + id);
    await expect(page.getByText(/Se utiliza automáticamente la última tasa válida guardada/)).toBeVisible();
    await expect(page.getByText(/500\.50000000000000001 CRC\/USD · Fecha real: 2026-09-29/)).toBeVisible();
  } finally {
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: {} });
    await request.post("http://127.0.0.1:54329/test/expense-preview", { data: {} });
  }
});
for (const role of ["admin", "member"]) {
  test(`3D simulada: fallback visible y accesible ${role} en cinco anchos`, async ({page,request}) => {
    await request.post("http://127.0.0.1:54329/test/reset");
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(`${role}@example.test`);
    await page.getByLabel("Contraseña",{exact:true}).fill("Test-password-123!");
    await page.getByRole("button",{name:"Entrar a mi espacio"}).click();
    await expect(page).toHaveURL(/dashboard/);
    const id="96000000-0000-4000-8000-000000000001";
    try {
      await request.post("http://127.0.0.1:54329/test/expense-preview",{data:{expense:{
        id,category_id:"96000000-0000-4000-8000-000000000002",revision:1,
        amount:"1.00",currency:"USD",amount_crc:"500.50",status:"valid",
        expense_date:"2026-09-30T12:00:00-06:00",created_at:"2026-09-30T12:00:00-06:00",
        created_by:"00000000-0000-4000-8000-000000000002",description:"Fallback visual simulado",
        exchange_rate_applied:"500.50000000000000001",exchange_rate_date:"2026-09-29",
        exchange_rate_source:"BCCR via tipodecambio.paginasweb.cr",rate_is_fallback:true,rate_origin:"provider",
      }}});
      for(const width of [320,375,768,1024,1440]) {
        await page.setViewportSize({width,height:900});await page.goto("/gastos/"+id);
        await expect(page.getByText(/Se utiliza automáticamente la última tasa válida guardada/)).toBeVisible();
        await expect(page.getByText(/Fecha real: 2026-09-29/)).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        if(role==="admin") {
          await page.getByRole("button",{name:"Anular gasto",exact:true}).click();
          await page.locator(".swal2-confirm").click();
          await expect(page.getByText("Escribe el motivo")).toBeVisible();
          await expect(page.getByLabel("Motivo obligatorio")).toBeFocused();
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
          await page.locator(".swal2-cancel").click();
        } else await expect(page.getByRole("button",{name:"Anular gasto",exact:true})).toHaveCount(0);
      }
    } finally {await request.post("http://127.0.0.1:54329/test/expense-preview",{data:{}});}
  });
}
