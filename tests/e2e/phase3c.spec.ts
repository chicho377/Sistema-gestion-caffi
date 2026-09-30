import { test, expect } from "@playwright/test";
test("3C simulada: loading, vacío, error de lectura y recuperación", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Test-password-123!");
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await expect(page).toHaveURL(/dashboard/);
  try {
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: { delay: 2500 } });
    await page.goto("/ingresos-manuales", { waitUntil: "commit" });
    await expect(page.getByRole("status").filter({ hasText: "Cargando…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Todavía no hay ingresos manuales" })).toBeVisible();
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: { fail: true } });
    await page.goto("/ingresos-manuales", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "No pudimos cargar esta página" })).toBeVisible({ timeout: 20000 });
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: {} });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Todavía no hay ingresos manuales" })).toBeVisible();
  } finally {
    await request.post("http://127.0.0.1:54329/test/catalog-state", { data: {} });
  }
});
